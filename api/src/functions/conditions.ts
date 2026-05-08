import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import { NOAAForecastPeriod } from '../../shared/conditionsEngine'
import { upsertRegionCondition } from '../../shared/regionConditions'

const NOAA_POINTS = 'https://api.weather.gov/points'
const WSDOT_PASSES =
  'https://wsdot.wa.gov/traffic/api/MountainPassConditions/MountainPassConditionsREST.svc/GetMountainPassConditionsAsJson'
const FETCH_TIMEOUT_MS = 8_000

const REGION_SAMPLES: Record<string, { lat: number; lng: number; elevFt: number }> = {
  'Olympic Peninsula':     { lat: 47.82,  lng: -123.51, elevFt: 2000 },
  'North Cascades':        { lat: 48.73,  lng: -121.21, elevFt: 3500 },
  'Central Cascades':      { lat: 47.82,  lng: -121.42, elevFt: 3000 },
  'Snoqualmie Region':     { lat: 47.43,  lng: -121.41, elevFt: 2500 },
  'South Cascades':        { lat: 46.85,  lng: -121.73, elevFt: 3000 },
  'Eastern Washington':    { lat: 46.60,  lng: -118.40, elevFt: 1500 },
  'Puget Sound & Islands': { lat: 48.22,  lng: -122.58, elevFt:  500 },
  'Southwest Washington':  { lat: 46.10,  lng: -122.15, elevFt: 1500 },
}

function getLogger(context?: InvocationContext) {
  const bindLog = (fn: unknown, fallback: (...args: any[]) => void) =>
    typeof fn === 'function' ? fn.bind(context) as (...args: any[]) => void : fallback

  return {
    info: bindLog(context?.info ?? context?.log, console.info.bind(console)),
    warn: bindLog(context?.warn ?? context?.log, console.warn.bind(console)),
    error: bindLog(context?.error ?? context?.log, console.error.bind(console)),
  }
}

function getFetch(): typeof fetch {
  if ((globalThis as any).fetch) return (globalThis as any).fetch
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node-fetch')
}

async function fetchWithTimeout(url: string, init: any = {}): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    return await getFetch()(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function getSyncTokenFromRequest(req: HttpRequest): string | null {
  const token =
    req.headers.get('x-sync-token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(req.url).searchParams.get('token')

  return token?.trim() || null
}

function validateSyncToken(req: HttpRequest): boolean {
  const token = getSyncTokenFromRequest(req)
  const secret =
    process.env['SYNC_SECRET_TOKEN'] ??
    process.env['SYNC_TOKEN'] ??
    process.env['SYNC_SECRET']

  return !!token && !!secret && token === secret
}

async function getNOAAForecast(lat: number, lng: number): Promise<NOAAForecastPeriod[] | null> {
  try {
    const ptRes = await fetchWithTimeout(`${NOAA_POINTS}/${lat.toFixed(4)},${lng.toFixed(4)}`, {
      headers: { 'User-Agent': '(wa-hiking-app, contact@example.com)' },
    })
    if (!ptRes.ok) return null

    const ptData = await ptRes.json() as { properties?: { forecast?: string } }
    const forecastUrl = ptData.properties?.forecast
    if (!forecastUrl) return null

    const fcRes = await fetchWithTimeout(forecastUrl, {
      headers: { 'User-Agent': '(wa-hiking-app, contact@example.com)' },
    })
    if (!fcRes.ok) return null

    const fcData = await fcRes.json() as { properties?: { periods?: NOAAForecastPeriod[] } }
    return fcData.properties?.periods ?? null
  } catch {
    return null
  }
}

async function getWSDOTPasses(): Promise<Map<string, string>> {
  const alerts = new Map<string, string>()
  const token = process.env['WSDOT_ACCESS_CODE']
  if (!token) return alerts

  try {
    const res = await fetchWithTimeout(`${WSDOT_PASSES}?AccessCode=${encodeURIComponent(token)}`)
    if (!res.ok) return alerts

    const passes = await res.json() as Array<{
      MountainPassName: string
      RoadCondition: string
      TravelAdvisoryActive: boolean
      RestrictionOne?: { TravelDirection: string; RestrictionText: string }
    }>

    for (const pass of passes) {
      const key = (pass.MountainPassName || '').toLowerCase()
      if (pass.TravelAdvisoryActive || pass.RestrictionOne) {
        alerts.set(key, pass.RestrictionOne?.RestrictionText ?? pass.RoadCondition)
      }
    }
  } catch {
    // WSDOT is non-fatal; NOAA region snapshots are the important part.
  }

  return alerts
}

async function conditionsSyncHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const logger = getLogger(context)

  try {
    if (!validateSyncToken(req)) {
      return { status: 401, jsonBody: { ok: false, error: 'Unauthorized' } }
    }

    const missing = [
      ['SYNC_SECRET_TOKEN', 'SYNC_TOKEN', 'SYNC_SECRET'].some(k => process.env[k]) ? null : 'SYNC_SECRET_TOKEN',
      process.env['COSMOS_ENDPOINT'] ? null : 'COSMOS_ENDPOINT',
      process.env['COSMOS_KEY'] ? null : 'COSMOS_KEY',
      process.env['COSMOS_DATABASE'] || process.env['COSMOS_DB_NAME'] ? null : 'COSMOS_DATABASE or COSMOS_DB_NAME',
      process.env['COSMOS_CONTAINER'] ? null : 'COSMOS_CONTAINER',
    ].filter((k): k is string => !!k)

    if (missing.length) {
      logger.error(`Missing env vars: ${missing.join(', ')}`)
      return { status: 500, jsonBody: { ok: false, error: 'Server misconfiguration', missing } }
    }

    const container = getTrailsContainer()
    logger.info('Starting conditions sync (regional NOAA snapshots)...')

    const forecastResults = await Promise.all(
      Object.entries(REGION_SAMPLES).map(async ([region, sample]) => {
        const periods = await getNOAAForecast(sample.lat, sample.lng)
        logger.info(`NOAA ${region}: ${periods ? 'ok' : 'failed'}`)
        return { region, sample, periods }
      })
    )

    const passAlerts = await getWSDOTPasses()
    logger.info(`WSDOT: ${passAlerts.size} active pass alerts`)

    let updatedRegions = 0
    const skippedRegions: string[] = []

    for (const result of forecastResults) {
      if (!result.periods?.length) {
        skippedRegions.push(result.region)
        continue
      }

      try {
        await upsertRegionCondition(
          container,
          result.region,
          result.sample,
          result.periods,
          passAlerts.size,
        )
        updatedRegions++
      } catch (err) {
        skippedRegions.push(result.region)
        logger.error(`Region condition upsert failed for ${result.region}: ${String(err)}`)
      }
    }

    logger.info(`Conditions sync complete: ${updatedRegions} regional snapshots updated`)

    return {
      status: 200,
      jsonBody: {
        ok: true,
        updated: updatedRegions,
        updatedRegions,
        skippedRegions,
        wsdotAlerts: passAlerts.size,
      },
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    logger.error('Conditions sync failed:', error)
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: error.message,
      },
    }
  }
}

app.http('sync-conditions', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: conditionsSyncHandler,
})
