import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import { regionFromLatLng, cleanName } from '../../shared/trailMapper'

// WA State Parks open data via Socrata — completely free, no key
// Dataset: WA State Parks locations with amenities
const PARKS_URL = 'https://data.wa.gov/resource/qeqb-pjy8.json'
const PAGE_SIZE = 1000

interface WAParkRecord {
  site_name?: string
  park_name?: string
  type_class?: string
  trails?: string
  trail_miles?: string
  latitude?: string
  longitude?: string
  discover_pass_required?: string
  amenities?: string
  [key: string]: unknown
}

function validateSyncToken(req: HttpRequest): boolean {
  const token = req.headers.get('x-sync-token') ?? new URL(req.url).searchParams.get('token')
  return token === process.env['SYNC_SECRET_TOKEN']
}

async function waparksSyncHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!validateSyncToken(req)) return { status: 401, jsonBody: { error: 'Unauthorized' } }

  context.log('Starting WA State Parks sync...')
  let upserted = 0
  let offset = 0
  const container = getTrailsContainer()

  try {
    while (true) {
      const url = new URL(PARKS_URL)
      url.searchParams.set('$limit', String(PAGE_SIZE))
      url.searchParams.set('$offset', String(offset))
      // Only parks with trails
      url.searchParams.set('$where', 'trail_miles > 0 OR trails = \'Yes\'')

      const res = await fetch(url.toString())
      if (!res.ok) break
      const records: WAParkRecord[] = await res.json()
      if (!records.length) break

      for (const park of records) {
        const lat = parseFloat(park.latitude ?? '0')
        const lng = parseFloat(park.longitude ?? '0')
        if (!lat || !lng) continue

        const name = park.site_name ?? park.park_name ?? 'Unknown Park'
        const trailMiles = parseFloat(park.trail_miles ?? '1')
        const region = regionFromLatLng(lat, lng)
        const discoverPass = (park.discover_pass_required ?? '').toLowerCase() === 'yes'

        const trailDoc = {
          id: `waparks-${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}`,
          pk: region,
          name: cleanName(name),
          region,
          lat, lng,
          miles: trailMiles > 0 ? trailMiles : 2.0,
          elevationGainFt: 0,
          difficulty: 'Easy' as const,
          routeType: 'Loop' as const,
          landOwner: 'StateParks' as const,
          parking: {
            type: discoverPass ? 'discover_pass' as const : 'free' as const,
            notes: discoverPass ? 'Discover Pass required' : 'No pass required',
            confidence: 'high' as const,
          },
          access: { level: 'sedan_ok' as const, confidence: 'high' as const },
          conditions: {
            overall: 'unknown' as const,
            snow: 'none' as const, mud: 'dry' as const, bugs: 'none' as const,
            notes: [],
          },
          description: `WA State Park with ${trailMiles} miles of trails`,
          source: 'wa_parks' as const,
          syncedAt: new Date().toISOString(),
        }

        await container.items.upsert(trailDoc)
        upserted++
      }

      if (records.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    return { status: 200, jsonBody: { ok: true, upserted } }
  } catch (err) {
    context.error('WA Parks sync failed:', err)
    return { status: 500, jsonBody: { ok: false, error: String(err) } }
  }
}

app.http('sync-waparks', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: waparksSyncHandler,
})
