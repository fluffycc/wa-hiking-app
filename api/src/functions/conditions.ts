import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import { deriveConditions, NOAAForecastPeriod } from '../../shared/conditionsEngine'

// NOAA — free, no key required
const NOAA_POINTS = 'https://api.weather.gov/points'

// WSDOT Mountain Pass Conditions — free with a free API key
const WSDOT_PASSES =
  'https://wsdot.wa.gov/traffic/api/MountainPassConditions/MountainPassConditionsREST.svc/GetMountainPassConditionsAsJson'

// Representative lat/lng per WA region for NOAA sampling
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

const UPDATE_BATCH_SIZE = 20

interface TrailConditionProjection {
  id: string
  pk?: string
  name?: string
  region?: string
  trailheadElevationFt?: number
  elevationGainFt?: number
  conditions?: Record<string, unknown>
  alerts?: Array<unknown>
}

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(worker))
  }
}

/**
 * Normalized logger that maps to context.log.* when available,
 * and falls back to console.*. Ensures info/warn/error are always functions.
 */
function getLogger(context?: InvocationContext) {
  const bindLog = (fn: unknown, fallback: (...args: any[]) => void) =>
    typeof fn === 'function' ? fn.bind(context) as (...args: any[]) => void : fallback

  return {
    info: bindLog(context?.info ?? context?.log, console.info.bind(console)),
    warn: bindLog(context?.warn ?? context?.log, console.warn.bind(console)),
    error: bindLog(context?.error ?? context?.log, console.error.bind(console)),
    debug: bindLog(context?.debug ?? context?.log, console.debug?.bind(console) ?? console.log.bind(console)),
  }
}

/**
 * Helper to obtain a fetch implementation.
 * Most modern Node runtimes (18+) provide global fetch.
 * If your runtime does not, install node-fetch and this will require it at runtime.
 */
function getFetch(): typeof fetch {
  if ((globalThis as any).fetch) return (globalThis as any).fetch
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
  const nf = require('node-fetch')
  return nf
}

/**
 * Safely extract the sync token from the request.
 * Supports:
 *  - x-sync-token header (preferred)
 *  - Authorization: Bearer <token>
 *  - ?token= query param
 */
function getSyncTokenFromRequest(req: HttpRequest): string | null {
  try {
    if (req && req.headers) {
      const headers = req.headers as Headers & Record<string, string | undefined>
      const headerToken =
        typeof headers.get === 'function'
          ? headers.get('x-sync-token')
          : headers['x-sync-token'] || headers['X-Sync-Token']

      if (headerToken) return headerToken

      const auth =
        typeof headers.get === 'function'
          ? headers.get('authorization')
          : headers['authorization'] || headers['Authorization']

      if (auth && typeof auth === 'string') {
        const m = auth.match(/Bearer\s+(.+)/i)
        if (m) return m[1]
      }
    }

    if (req && req.url) {
      try {
        const url = new URL(req.url)
        const q = url.searchParams.get('token')
        if (q) return q
      } catch {
        // ignore malformed URL
      }
    }
  } catch {
    // defensive: any unexpected shape -> null
  }
  return null
}

async function getNOAAForecast(lat: number, lng: number): Promise<NOAAForecastPeriod[] | null> {
  const fetchImpl = getFetch()
  try {
    const ptRes = await fetchImpl(`${NOAA_POINTS}/${lat.toFixed(4)},${lng.toFixed(4)}`, {
      headers: { 'User-Agent': '(wa-hiking-app, contact@example.com)' },
    })
    if (!ptRes.ok) return null
    const ptData = await ptRes.json() as { properties?: { forecast?: string } }
    const forecastUrl = ptData.properties?.forecast
    if (!forecastUrl) return null

    const fcRes = await fetchImpl(forecastUrl, {
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
  const fetchImpl = getFetch()
  try {
    const res = await fetchImpl(`${WSDOT_PASSES}?AccessCode=${encodeURIComponent(token)}`)
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
    // best-effort; return whatever we collected
  }
  return alerts
}

function alertIndicatesClosure(message: string): boolean {
  return /\b(closed|closure|impassable|not accessible|no access|blocked)\b/i.test(message)
}

async function conditionsSyncHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const logger = getLogger(context)

  try {
    // --- Debug: check env secret under multiple common names and log masked presence/length ---
    // Accept either SYNC_SECRET_TOKEN (preferred) or SYNC_TOKEN (common workflow name)
    const envSecret =
      process.env['SYNC_SECRET_TOKEN'] ??
      process.env['SYNC_TOKEN'] ??
      process.env['SYNC_SECRET'] ?? // extra fallback if used
      null

    const tokenRaw = getSyncTokenFromRequest(req)
    const token = tokenRaw ? tokenRaw.trim() : null
    const secretPresent = !!envSecret
    const tokenPresent = !!token
    const secretLen = envSecret ? String(envSecret).length : 0
    const tokenLen = token ? String(token).length : 0
    const isMatch = tokenPresent && secretPresent && token === envSecret

    logger.info(`SYNC secret present in env: ${secretPresent}; env token length: ${secretLen}`)
    logger.info(`Token present in request: ${tokenPresent}; token length: ${tokenLen}`)
    logger.info(`Token match: ${isMatch}`)
    // -------------------------------------------------------------------------

    if (!isMatch) {
      logger.warn('Unauthorized sync attempt: missing or invalid token')
      return {
        status: 401,
        jsonBody: { error: 'Unauthorized' },
      }
    }

    logger.info('Starting conditions sync (NOAA + WSDOT)...')

    // Validate required env vars early. Some older setup docs used aliases.
    const missing = [
      ['SYNC_SECRET_TOKEN', 'SYNC_TOKEN', 'SYNC_SECRET'].some(k => process.env[k]) ? null : 'SYNC_SECRET_TOKEN',
      process.env['COSMOS_ENDPOINT'] ? null : 'COSMOS_ENDPOINT',
      process.env['COSMOS_KEY'] ? null : 'COSMOS_KEY',
      process.env['COSMOS_DATABASE'] || process.env['COSMOS_DB_NAME'] ? null : 'COSMOS_DATABASE or COSMOS_DB_NAME',
      process.env['COSMOS_CONTAINER'] ? null : 'COSMOS_CONTAINER',
    ].filter((k): k is string => !!k)

    if (missing.length > 0) {
      logger.error(`Missing env vars: ${missing.join(', ')}`)

      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: 'Server misconfiguration',
          missing,
        },
      }
    }

    // 1. NOAA forecasts
    const forecasts = new Map<string, NOAAForecastPeriod[]>()

    await Promise.all(
      Object.entries(REGION_SAMPLES).map(async ([region, sample]) => {
        try {
          const periods = await getNOAAForecast(sample.lat, sample.lng)
          if (periods) forecasts.set(region, periods)
          logger.info(`NOAA ${region}: ${periods ? 'ok' : 'failed'}`)
        } catch (err) {
          logger.error(`NOAA ${region} fetch error: ${String(err)}`)
        }
      })
    )

    // 2. WSDOT alerts
    const passAlerts = await getWSDOTPasses()
    logger.info(`WSDOT: ${passAlerts.size} active alerts`)

    // 3. Cosmos init
    const container = getTrailsContainer()
    if (!container) {
      logger.error('Cosmos container initialization failed')
      return {
        status: 500,
        jsonBody: { ok: false, error: 'Cosmos initialization failed' },
      }
    }

    let updated = 0

    for (const [region, sample] of Object.entries(REGION_SAMPLES)) {
      const periods = forecasts.get(region)
      if (!periods) {
        logger.info(`Skipping region ${region} — no forecast data`)
        continue
      }

      // Query trails for region
      let trails: TrailConditionProjection[] = []
      try {
        const querySpec = {
          query: [
            'SELECT t.id, t.pk, t.name, t.region,',
            't.trailheadElevationFt, t.elevationGainFt, t.conditions, t.alerts',
            'FROM t WHERE t.region = @r',
          ].join(' '),
          parameters: [{ name: '@r', value: region }],
        }
        const { resources } = await container.items.query(querySpec, { enableCrossPartitionQuery: true }).fetchAll()
        trails = resources ?? []
      } catch (err) {
        logger.error(`Cosmos query failed for region ${region}: ${String(err)}`)
        continue
      }

      await runInBatches(trails, UPDATE_BATCH_SIZE, async (trail) => {
        try {
          const trailheadElev = trail.trailheadElevationFt ?? sample.elevFt
          const summitElev = trailheadElev + (trail.elevationGainFt ?? 0)

          const derived = deriveConditions(periods, trailheadElev, summitElev)

          const trailAlerts: Array<{
            type: 'closure' | 'warning'
            message: string
            source: string
            reportedISO: string
          }> = []

          for (const [passName, alertMsg] of passAlerts) {
            if (
              (trail.name && trail.name.toLowerCase().includes(passName)) ||
              (trail.region && trail.region.toLowerCase().includes(passName.split(' ')[0]))
            ) {
              trailAlerts.push({
                type: alertIndicatesClosure(alertMsg) ? 'closure' : 'warning',
                message: alertMsg,
                source: 'WSDOT',
                reportedISO: new Date().toISOString(),
              })
            }
          }

          await container.item(trail.id, trail.pk ?? trail.region ?? region).patch([
            {
              op: 'set',
              path: '/conditions',
              value: {
              ...trail.conditions,
              overall: derived.overall,
              snow: derived.snow,
              mud: derived.mud,
              bugs: derived.bugs,
              weatherHint: derived.weatherHint,
              notes: derived.notes,
              lastUpdatedISO: derived.lastUpdatedISO,
              },
            },
            {
              op: 'set',
              path: '/alerts',
              value: trailAlerts.length ? trailAlerts : trail.alerts ?? [],
            },
          ])

          updated++
        } catch (err) {
          logger.error(`Failed to update trail ${trail?.id ?? trail?.name ?? '<unknown>'}: ${String(err)}`)
        }
      })
    }

    logger.info(`Conditions sync complete: ${updated} trails updated`)

    return {
      status: 200,
      jsonBody: {
        ok: true,
        updated,
        regions: forecasts.size,
        wsdotAlerts: passAlerts.size,
      },
    }
  } catch (err) {
    logger.error('Conditions sync failed:', err)
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

app.http('sync-conditions', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: conditionsSyncHandler,
})
