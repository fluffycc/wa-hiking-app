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

/**
 * Normalized logger that maps to context.log.* when available,
 * and falls back to console.*. Ensures info/warn/error are always functions.
 */
function getLogger(context?: InvocationContext) {
  const base = context?.log ?? console
  return {
    info: typeof base.info === 'function' ? base.info.bind(base) : console.log.bind(console),
    warn: typeof base.warn === 'function' ? base.warn.bind(base) : console.warn.bind(console),
    error: typeof base.error === 'function' ? base.error.bind(base) : console.error.bind(console),
    debug: typeof base.debug === 'function' ? base.debug.bind(base) : console.debug?.bind(console) ?? console.log.bind(console),
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
 * Azure Functions HttpRequest.headers is a plain object with lowercased keys.
 */
function getSyncTokenFromRequest(req: HttpRequest): string | null {
  try {
    if (req && req.headers) {
      const headerToken = (req.headers['x-sync-token'] || req.headers['X-Sync-Token']) as string | undefined
      if (headerToken) return headerToken
    }

    if (req && req.url) {
      try {
        const url = new URL(req.url)
        return url.searchParams.get('token')
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

async function conditionsSyncHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const logger = getLogger(context)

  try {
    // --- Debug: log presence and masked match info (do not print secret value) ---
    const tokenRaw = getSyncTokenFromRequest(req)
    const token = tokenRaw ? tokenRaw.trim() : null
    const secret = process.env['SYNC_SECRET_TOKEN']
    const secretPresent = !!secret
    const tokenPresent = !!token
    const secretLen = secret ? String(secret).length : 0
    const tokenLen = token ? String(token).length : 0
    const isMatch = tokenPresent && secretPresent && token === secret

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

    // Validate required env vars early
    const requiredEnv = [
      'SYNC_SECRET_TOKEN',
      'COSMOS_ENDPOINT',
      'COSMOS_KEY',
      'COSMOS_DATABASE',
      'COSMOS_CONTAINER',
    ]

    const missing = requiredEnv.filter(k => !process.env[k])

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
      let trails: any[] = []
      try {
        const querySpec = {
          query: 'SELECT * FROM t WHERE t.region = @r',
          parameters: [{ name: '@r', value: region }],
        }
        const { resources } = await container.items.query(querySpec, { enableCrossPartitionQuery: true }).fetchAll()
        trails = resources ?? []
      } catch (err) {
        logger.error(`Cosmos query failed for region ${region}: ${String(err)}`)
        continue
      }

      for (const trail of trails) {
        try {
          const trailheadElev = trail.trailheadElevationFt ?? sample.elevFt
          const summitElev = trailheadElev + (trail.elevationGainFt ?? 0)

          const derived = deriveConditions(periods, trailheadElev, summitElev)

          const trailAlerts: Array<{
            type: 'warning'
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
                type: 'warning',
                message: alertMsg,
                source: 'WSDOT',
                reportedISO: new Date().toISOString(),
              })
            }
          }

          // Upsert updated conditions
          await container.items.upsert({
            ...trail,
            conditions: {
              ...trail.conditions,
              overall: derived.overall,
              snow: derived.snow,
              mud: derived.mud,
              bugs: derived.bugs,
              weatherHint: derived.weatherHint,
              notes: derived.notes,
              lastUpdatedISO: derived.lastUpdatedISO,
            },
            alerts: trailAlerts.length ? trailAlerts : trail.alerts ?? [],
          })

          updated++
        } catch (err) {
          logger.error(`Failed to update trail ${trail?.id ?? trail?.name ?? '<unknown>'}: ${String(err)}`)
        }
      }
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
