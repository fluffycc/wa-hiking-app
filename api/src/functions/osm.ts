import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import {
  regionFromLatLng, osmSacScaleToDifficulty,
  operatorToLandOwner, landOwnerToParking,
  surfaceToAccessLevel, metersToMiles, cleanName,
} from '../../shared/trailMapper'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// Query WA hiking route relations with geometry
const OSM_QUERY = `
[out:json][timeout:180];
area["ISO3166-2"="US-WA"][admin_level=4]->.wa;
(
  relation["route"="hiking"]["name"]["distance"](area.wa);
);
out body;
>;
out skel qt;
`

// Query WA trail ways with names and difficulty
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
  members?: Array<{ type: string; ref: number; role: string }>
  nodes?: number[]
}

function validateSyncToken(req: HttpRequest): boolean {
  const token = req.headers.get('x-sync-token') ?? new URL(req.url).searchParams.get('token')
  return token === process.env['SYNC_SECRET_TOKEN']
}

async function osmSyncHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!validateSyncToken(req)) return { status: 401, jsonBody: { error: 'Unauthorized' } }

  context.log('Starting OSM sync for WA hiking trails...')
  let upserted = 0
  let errors = 0

  try {
    // Fetch WA trail ways from Overpass
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(OSM_WAYS_QUERY)}`,
    })

    if (!res.ok) throw new Error(`Overpass error: ${res.status}`)
    const data = await res.json() as { elements: OsmElement[] }

    const ways = data.elements.filter(e => e.type === 'way' && e.center && e.tags?.name)
    context.log(`Found ${ways.length} OSM trail ways in WA`)

    const container = getTrailsContainer()

    // Fetch road surface data for trailheads in parallel batches
    const BATCH = 20
    for (let i = 0; i < ways.length; i += BATCH) {
      const batch = ways.slice(i, i + BATCH)
      await Promise.all(batch.map(async way => {
        try {
          const tags = way.tags!
          const lat = way.center!.lat
          const lng = way.center!.lon

          // Get road surface near this trailhead from OSM
          const roadData = await fetchRoadSurface(lat, lng)
          const accessLevel = surfaceToAccessLevel(roadData?.surface, roadData?.smoothness)

          const region = regionFromLatLng(lat, lng)
          const owner = operatorToLandOwner(tags['operator'])
          const distanceMeters = parseFloat(tags['distance'] ?? '0') * (tags['distance:units'] === 'km' ? 1000 : 1609)
          const miles = distanceMeters > 0 ? metersToMiles(distanceMeters) : parseFloat(tags['est_width'] ?? '5')

          const trailDoc = {
            id:   `osm-${way.id}`,
            pk:   region,
            osmId: String(way.id),
            name: cleanName(tags['name']),
            region,
            lat,
            lng,
            miles: miles > 0 ? miles : 3.0,
            elevationGainFt: 0,
            difficulty: osmSacScaleToDifficulty(tags['sac_scale'] ?? 'hiking'),
            routeType: tags['route'] === 'loop' ? 'Loop' : 'OutAndBack',
            landOwner: owner,
            parking: { type: landOwnerToParking(owner), confidence: 'low' as const },
            access: { level: accessLevel, notes: roadData?.name, confidence: roadData ? 'medium' as const : 'low' as const },
            conditions: {
              overall: 'unknown' as const,
              snow: 'none' as const,
              mud: 'dry' as const,
              bugs: 'none' as const,
              notes: [],
            },
            roadCondition: roadData ? {
              surface: roadData.surface as 'paved' | 'gravel' | 'dirt' | 'unknown' ?? 'unknown',
              condition: roadData.smoothness ? osmSmoothnessToCondition(roadData.smoothness) : 'unknown' as const,
              notes: roadData.name,
              confidence: 'medium' as const,
              lastUpdatedISO: new Date().toISOString(),
            } : undefined,
            source: 'osm' as const,
            syncedAt: new Date().toISOString(),
          }

          await container.items.upsert(trailDoc)
          upserted++
        } catch (e) {
          context.warn(`Failed to upsert OSM way ${way.id}:`, e)
          errors++
        }
      }))

      // Respect Overpass rate limits
      if (i + BATCH < ways.length) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }

    context.log(`OSM sync complete: ${upserted} upserted, ${errors} errors`)
    return { status: 200, jsonBody: { ok: true, upserted, errors } }

  } catch (err) {
    context.error('OSM sync failed:', err)
    return { status: 500, jsonBody: { ok: false, error: String(err) } }
  }
}

async function fetchRoadSurface(lat: number, lng: number): Promise<{
  surface?: string; smoothness?: string; name?: string
} | null> {
  const query = `
[out:json][timeout:20];
(
  way(around:2500,${lat},${lng})["highway"]["surface"];
  way(around:2500,${lat},${lng})["highway"]["smoothness"];
);
out body 5;
`
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    })
    if (!res.ok) return null
    const data = await res.json() as { elements: OsmElement[] }
    const roads = data.elements.filter(e => e.tags?.highway && e.tags?.surface)
    if (!roads.length) return null
    // Prefer the worst road near the trailhead (conservative)
    const worst = roads.reduce((prev, cur) => {
      const rank = (s?: string) => ['paved', 'asphalt', 'gravel', 'compacted', 'unpaved', 'dirt', 'earth'].indexOf(s?.toLowerCase() ?? '') 
      return rank(cur.tags?.surface) > rank(prev.tags?.surface) ? cur : prev
    })
    return {
      surface:   worst.tags?.surface,
      smoothness: worst.tags?.smoothness,
      name:      worst.tags?.name,
    }
  } catch {
    return null
  }
}

function osmSmoothnessToCondition(s: string): 'excellent' | 'good' | 'rough' | 'very_rough' | 'unknown' {
  switch (s.toLowerCase()) {
    case 'excellent':  return 'excellent'
    case 'good':       return 'good'
    case 'intermediate': return 'good'
    case 'bad':        return 'rough'
    case 'very_bad':   return 'very_rough'
    case 'horrible':   return 'very_rough'
    default:           return 'unknown'
  }
}

app.http('sync-osm', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: osmSyncHandler,
})
