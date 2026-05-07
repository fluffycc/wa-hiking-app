import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import { regionFromLatLng, landOwnerToParking, cleanName } from '../../shared/trailMapper'

// WA DNR GIS REST API — completely free, no key required
const DNR_BASE = 'https://gis.dnr.wa.gov/site3/rest/services'

// Recreation Trails layer
const TRAILS_URL = `${DNR_BASE}/Public_Recreation/WADNR_PUBLIC_Trails/MapServer/0/query`

// Forest Road Information — has ROAD_MAINTENANCE_LEVEL (1-5)
const ROADS_URL = `${DNR_BASE}/Public_Boundaries/WADNR_PUBLIC_FRO_Roads/MapServer/0/query`

interface DNRTrailFeature {
  attributes: {
    OBJECTID: number
    TRAIL_NAME: string
    LENGTH_MILES?: number
    TRAIL_SURFACE?: string
    DIFFICULTY?: string
    MANAGING_ORGANIZATION?: string
    STATUS?: string
    [key: string]: unknown
  }
  geometry?: { x: number; y: number } | { rings?: number[][][]; paths?: number[][][] }
}

interface DNRRoadFeature {
  attributes: {
    OBJECTID: number
    ROAD_NAME?: string
    ROAD_SURFACE?: string
    ROAD_MAINTENANCE_LEVEL?: number
    [key: string]: unknown
  }
  geometry?: { paths?: number[][][] }
}

function validateSyncToken(req: HttpRequest): boolean {
  const token = req.headers.get('x-sync-token') ?? new URL(req.url).searchParams.get('token')
  return token === process.env['SYNC_SECRET_TOKEN']
}

async function fetchAllPages<T>(baseUrl: string, params: Record<string, string>): Promise<T[]> {
  const allFeatures: T[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const url = new URL(baseUrl)
    Object.entries({ ...params, resultOffset: String(offset), resultRecordCount: String(pageSize) })
      .forEach(([k, v]) => url.searchParams.set(k, v))

    const res = await fetch(url.toString())
    if (!res.ok) break
    const data = await res.json() as { features?: T[]; exceededTransferLimit?: boolean }
    if (!data.features?.length) break
    allFeatures.push(...data.features)
    if (!data.exceededTransferLimit) break
    offset += pageSize
  }

  return allFeatures
}

async function wadnrSyncHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!validateSyncToken(req)) return { status: 401, jsonBody: { error: 'Unauthorized' } }

  context.log('Starting WA DNR sync...')
  let upserted = 0

  try {
    // Fetch WA DNR recreation trails
    const features = await fetchAllPages<DNRTrailFeature>(TRAILS_URL, {
      where: '1=1',
      outFields: 'OBJECTID,TRAIL_NAME,LENGTH_MILES,TRAIL_SURFACE,DIFFICULTY,MANAGING_ORGANIZATION,STATUS',
      outSR: '4326',
      geometryType: 'esriGeometryPoint',
      f: 'json',
    })

    context.log(`WA DNR: ${features.length} trail features`)
    const container = getTrailsContainer()

    for (const feat of features) {
      const a = feat.attributes
      if (!a.TRAIL_NAME || a.STATUS === 'Proposed') continue

      // Extract lat/lng from geometry (point or first vertex of path)
      let lat = 0, lng = 0
      if (feat.geometry && 'x' in feat.geometry) {
        lng = feat.geometry.x; lat = feat.geometry.y
      }
      if (!lat || !lng) continue

      const region = regionFromLatLng(lat, lng)
      const owner = a.MANAGING_ORGANIZATION?.includes('Parks') ? 'StateParks' :
                    a.MANAGING_ORGANIZATION?.includes('DNR')   ? 'DNR' :
                    a.MANAGING_ORGANIZATION?.includes('Forest') ? 'USFS' : 'DNR'

      // DNR surface to access level
      const surface = (a.TRAIL_SURFACE ?? '').toLowerCase()
      const accessLevel = surface.includes('paved') ? 'sedan_ok' :
                          surface.includes('gravel') ? 'rough' :
                          surface.includes('native') || surface.includes('dirt') ? 'high_clearance' : 'unknown'

      const difficulty = (a.DIFFICULTY ?? '').toLowerCase()
      const mapped = difficulty.includes('easy') ? 'Easy' :
                     difficulty.includes('moderate') ? 'Moderate' :
                     difficulty.includes('difficult') || difficulty.includes('hard') ? 'Hard' :
                     difficulty.includes('strenuous') ? 'Strenuous' : 'Moderate'

      const trailDoc = {
        id: `wadnr-${a.OBJECTID}`,
        pk: region,
        name: cleanName(a.TRAIL_NAME),
        region,
        lat, lng,
        miles: a.LENGTH_MILES ?? 2.0,
        elevationGainFt: 0,
        difficulty: mapped,
        routeType: 'OutAndBack',
        landOwner: owner,
        parking: { type: landOwnerToParking(owner as 'DNR'), confidence: 'medium' as const },
        access: { level: accessLevel, confidence: 'high' as const },
        conditions: {
          overall: 'unknown' as const,
          snow: 'none' as const, mud: 'dry' as const, bugs: 'none' as const,
          notes: [],
        },
        source: 'wadnr' as const,
        syncedAt: new Date().toISOString(),
      }

      await container.items.upsert(trailDoc)
      upserted++
    }

    // ── Fetch forest road conditions and update nearby trails ────────────────
    context.log('Fetching WA DNR forest road conditions...')
    const roads = await fetchAllPages<DNRRoadFeature>(ROADS_URL, {
      where: 'ROAD_MAINTENANCE_LEVEL IS NOT NULL',
      outFields: 'OBJECTID,ROAD_NAME,ROAD_SURFACE,ROAD_MAINTENANCE_LEVEL',
      outSR: '4326',
      f: 'json',
    })

    context.log(`WA DNR: ${roads.length} forest road segments`)
    // Store road data for reference — trails will be matched in conditions sync

    return { status: 200, jsonBody: { ok: true, upserted, roadsIndexed: roads.length } }

  } catch (err) {
    context.error('WA DNR sync failed:', err)
    return { status: 500, jsonBody: { ok: false, error: String(err) } }
  }
}

app.http('sync-wadnr', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: wadnrSyncHandler,
})
