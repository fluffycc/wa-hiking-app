import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import { deriveConditions, NOAAForecastPeriod } from '../../shared/conditionsEngine'

// NOAA — free, no key required
const NOAA_POINTS = 'https://api.weather.gov/points'

// WSDOT Mountain Pass Conditions — free with a free API key
const WSDOT_PASSES = 'https://wsdot.wa.gov/traffic/api/MountainPassConditions/MountainPassConditionsREST.svc/GetMountainPassConditionsAsJson'

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

function validateSyncToken(req: HttpRequest): boolean {
  const token = req.headers.get('x-sync-token') ?? new URL(req.url).searchParams.get('token')
  return token === process.env['SYNC_SECRET_TOKEN']
}

async function getNOAAForecast(lat: number, lng: number): Promise<NOAAForecastPeriod[] | null> {
  try {
    const ptRes = await fetch(`${NOAA_POINTS}/${lat.toFixed(4)},${lng.toFixed(4)}`, {
      headers: { 'User-Agent': '(wa-hiking-app, contact@example.com)' },
    })
    if (!ptRes.ok) return null
    const ptData = await ptRes.json() as { properties?: { forecast?: string } }
    const forecastUrl = ptData.properties?.forecast
    if (!forecastUrl) return null

    const fcRes = await fetch(forecastUrl, {
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
    const res = await fetch(`${WSDOT_PASSES}?AccessCode=${token}`)
    if (!res.ok) return alerts
    const passes = await res.json() as Array<{
      MountainPassName: string
      RoadCondition: string
      TravelAdvisoryActive: boolean
      RestrictionOne?: { TravelDirection: string; RestrictionText: string }
    }>
    for (const pass of passes) {
      const key = pass.MountainPassName.toLowerCase()
      if (pass.TravelAdvisoryActive || pass.RestrictionOne) {
        alerts.set(key, pass.RestrictionOne?.RestrictionText ?? pass.RoadCondition)
      }
    }
  } catch { /* best-effort */ }
  return alerts
}

async function conditionsSyncHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {

  if (!validateSyncToken(req)) {
    return {
      status: 401,
      jsonBody: { error: 'Unauthorized' },
    }
  }

  try {
    context.log('Starting conditions sync (NOAA + WSDOT)...')

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
      context.error(`Missing env vars: ${missing.join(', ')}`)

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
        const periods = await getNOAAForecast(sample.lat, sample.lng)

        if (periods) forecasts.set(region, periods)

        context.log(`NOAA ${region}: ${periods ? 'ok' : 'failed'}`)
      })
    )

    // 2. WSDOT alerts
    const passAlerts = await getWSDOTPasses()

    context.log(`WSDOT: ${passAlerts.size} active alerts`)

    // 3. Cosmos init
    const container = getTrailsContainer()

    let updated = 0

    for (const [region, sample] of Object.entries(REGION_SAMPLES)) {
      const periods = forecasts.get(region)

      if (!periods) continue

      const { resources: trails } = await container.items.query(
        {
          query: 'SELECT * FROM t WHERE t.region = @r',
          parameters: [{ name: '@r', value: region }],
        },
        { enableCrossPartitionQuery: true }
      ).fetchAll()

      for (const trail of trails) {
        const trailheadElev =
          trail.trailheadElevationFt ?? sample.elevFt

        const summitElev =
          trailheadElev + (trail.elevationGainFt ?? 0)

        const derived = deriveConditions(
          periods,
          trailheadElev,
          summitElev
        )

        const trailAlerts = []

        for (const [passName, alertMsg] of passAlerts) {
          if (
            trail.name?.toLowerCase().includes(passName) ||
            trail.region?.toLowerCase().includes(passName.split(' ')[0])
          ) {
            trailAlerts.push({
              type: 'warning' as const,
              message: alertMsg,
              source: 'WSDOT',
              reportedISO: new Date().toISOString(),
            })
          }
        }

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
          alerts: trailAlerts.length
            ? trailAlerts
            : trail.alerts ?? [],
        })

        updated++
      }
    }

    context.log(`Conditions sync complete: ${updated} trails updated`)

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
    context.error('Conditions sync failed:', err)

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
