import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import {
  regionFromLatLng, osmSacScaleToDifficulty,
  operatorToLandOwner, landOwnerToParking,
  surfaceToAccessLevel, metersToMiles, cleanName,
} from '../../shared/trailMapper'

// Multiple Overpass instances — tried in order if one fails
const OVERPASS_INSTANCES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

// Required by Overpass usage policy — identifies your application
const USER_AGENT = 'WAHikingApp/1.0 (github.com/wa-hiking-app; trail-finder)'

// WA hiking trail ways with names and difficulty tags
const OSM_WAYS_QUERY = `
[out:json][timeout:180];
area["ISO3166-2"="US-WA"][admin_level=4]->.wa;
way["highway"~"path|footway"]["name"]["sac_scale"](area.wa);
out body center;
`

interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  center?: { lat: number; lon: number }
  lat?: number
  lon?: number
  tags?: Record<string, string>
}

function validateSyncToken(req: HttpRequest): boolean {
  const token = req.headers.get('x-sync-token') ?? new URL(req.url).searchParams.get('token')
  return token === process.env['SYNC_SECRET_TOKEN']
}

// Try each Overpass instance until one succeeds
async function queryOverpass(query: string): Promise<{ elements: OsmElement[] }> {
  let lastError = ''
  for (const url of OVERPASS_INSTANCES) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (res.status === 429 || res.status === 406) {
        lastError = `${url} returned ${res.status} — trying next instance`
        continue
      }
      if (!res.ok) {
        lastError = `${url} returned ${res.status}`
        continue
      }
      return await res.json() as { elements: OsmElement[] }
    } catch (e) {
      lastError = `${url} threw: ${e}`
      continue
    }
  }
  throw new Error(`All Overpass instances failed. Last error: ${lastError}`)
}

// Get road surface near a trailhead — best-effort, returns null if unavailable
async function fetchRoadSurface(lat: number, lng: number): Promise<{
  surface?: string; smoothness?: string; name?: string
} | null> {
  const query = `
[out:json][timeout:20];
way(around:2500,${lat},${lng})["highway"]["surface"];
out body 5;
`
  try {
    const data = await queryOverpass(query)
    const roads = data.elements.filter(e => e.tags?.highway && e.tags?.surface)
    if (!roads.length) return null
    const worst = roads.reduce((prev, cur) => {
      const rank = (s?: string) =>
        ['paved','asphalt','gravel','compacted','unpaved','dirt','earth'].indexOf(s?.toLowerCase() ?? '')
      return rank(cur.tags?.surface) > rank(prev.tags?.surface) ? cur : prev
    })
    return { surface: worst.tags?.surface, smoothness: worst.tags?.smoothness, name: worst.tags?.name }
  } catch {
    return null
  }
}

function osmSmoothnessToCondition(s: string): 'excellent' | 'good' | 'rough' | 'very_rough' | 'unknown' {
  switch (s.toLowerCase()) {
    case 'excellent':    return 'excellent'
    case 'good':         return 'good'
    case 'intermediate': return 'good'
    case 'bad':          return 'rough'
    case 'very_bad':     return 'very_rough'
    case 'horrible':     return 'very_rough'
    default:             return 'unknown'
  }
}

async function osmSyncHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!validateSyncToken(req)) return { status: 401, jsonBody: { error: 'Unauthorized' } }

  context.log('Starting OSM sync for WA hiking trails...')
  let upserted = 0
  let errors = 0

  try {
    const data = await queryOverpass(OSM_WAYS_QUERY)
    const ways = data.elements.filter(e => e.type === 'way' && e.center && e.tags?.name)
    context.log(`Found ${ways.length} OSM trail ways in WA`)

    const container = getTrailsContainer()
    const BATCH = 10 // smaller batches to avoid Overpass rate limits

    for (let i = 0; i < ways.length; i += BATCH) {
      const batch = ways.slice(i, i + BATCH)
      await Promise.all(batch.map(async way => {
        try {
          const tags = way.tags!
          const lat = way.center!.lat
          const lng = way.center!.lon
          const region = regionFromLatLng(lat, lng)
          const owner = operatorToLandOwner(tags['operator'])

          // Road surface — best effort, don't fail if unavailable
          const roadData = await fetchRoadSurface(lat, lng).catch(() => null)
          const accessLevel = surfaceToAccessLevel(roadData?.surface, roadData?.smoothness)

          const distMeters = parseFloat(tags['distance'] ?? '0') * 1000
          const miles = distMeters > 0 ? metersToMiles(distMeters) : 3.0

          await container.items.upsert({
            id:     `osm-${way.id}`,
            pk:     region,
            osmId:  String(way.id),
            name:   cleanName(tags['name']),
            region, lat, lng,
            miles,
            elevationGainFt: 0,
            difficulty:  osmSacScaleToDifficulty(tags['sac_scale'] ?? 'hiking'),
            routeType:   'OutAndBack',
            landOwner:   owner,
            parking:     { type: landOwnerToParking(owner), confidence: 'low' },
            access:      { level: accessLevel, notes: roadData?.name, confidence: roadData ? 'medium' : 'low' },
            conditions:  { overall: 'unknown', snow: 'none', mud: 'dry', bugs: 'none', notes: [] },
            roadCondition: roadData ? {
              surface:   roadData.surface ?? 'unknown',
              condition: roadData.smoothness ? osmSmoothnessToCondition(roadData.smoothness) : 'unknown',
              notes:     roadData.name,
              confidence: 'medium',
              lastUpdatedISO: new Date().toISOString(),
            } : undefined,
            source:    'osm',
            syncedAt:  new Date().toISOString(),
          })
          upserted++
        } catch (e) {
          context.warn(`Failed to upsert OSM way ${way.id}:`, e)
          errors++
        }
      }))

      // Respect Overpass rate limits between batches
      if (i + BATCH < ways.length) await new Promise(r => setTimeout(r, 2000))
    }

    context.log(`OSM sync complete: ${upserted} upserted, ${errors} errors`)
    return { status: 200, jsonBody: { ok: true, upserted, errors } }

  } catch (err) {
    context.error('OSM sync failed:', err)
    return { status: 500, jsonBody: { ok: false, error: String(err) } }
  }
}

app.http('sync-osm', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: osmSyncHandler,
})
