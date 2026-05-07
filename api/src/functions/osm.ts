import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import {
  regionFromLatLng,
  osmSacScaleToDifficulty,
  operatorToLandOwner,
  landOwnerToParking,
  metersToMiles,
  cleanName,
} from '../../shared/trailMapper'

const OVERPASS_INSTANCES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const USER_AGENT = 'WAHikingApp/1.0'

const OSM_WAYS_QUERY = `
[out:json][timeout:120];
area["ISO3166-2"="US-WA"][admin_level=4]->.wa;
way["highway"~"path|footway"]["name"]["sac_scale"](area.wa);
out body center;
`

interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function validateSyncToken(req: HttpRequest): boolean {
  const token =
    req.headers.get('x-sync-token') ??
    new URL(req.url).searchParams.get('token')

  return token === process.env['SYNC_SECRET_TOKEN']
}

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

      if (!res.ok) {
        lastError = `${url} -> ${res.status}`
        continue
      }

      return await res.json() as { elements: OsmElement[] }
    } catch (e) {
      lastError = `${url} failed`
    }
  }

  throw new Error(`All Overpass instances failed: ${lastError}`)
}

async function osmSyncHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {

  if (!validateSyncToken(req)) {
    return { status: 401, jsonBody: { ok: false, error: 'Unauthorized' } }
  }

  let upserted = 0
  let errors = 0

  try {
    context.log('Starting OSM sync...')

    const data = await queryOverpass(OSM_WAYS_QUERY)

    const ways = (data.elements ?? []).filter(
      e => e.type === 'way' && e.center && e.tags?.name
    )

    context.log(`OSM ways found: ${ways.length}`)

    const container = getTrailsContainer()

    // ⚠️ IMPORTANT: avoid Promise.all overload
    const BATCH_SIZE = 10

    for (let i = 0; i < ways.length; i += BATCH_SIZE) {
      const batch = ways.slice(i, i + BATCH_SIZE)

      for (const way of batch) {
        try {
          const tags = way.tags!
          const lat = way.center!.lat
          const lng = way.center!.lon

          const region = regionFromLatLng(lat, lng)
          const owner = operatorToLandOwner(tags['operator'])

          const miles = tags['distance']
            ? metersToMiles(parseFloat(tags['distance']) * 1000)
            : 3.0

          await container.items.upsert({
            id: `osm-${way.id}`,
            pk: region,

            osmId: String(way.id),
            name: cleanName(tags['name']),
            region,

            lat,
            lng,

            miles,
            elevationGainFt: 0,

            difficulty: osmSacScaleToDifficulty(tags['sac_scale'] ?? 'hiking'),
            routeType: 'OutAndBack',

            landOwner: owner,
            parking: {
              type: landOwnerToParking(owner),
              confidence: 'low',
            },

            access: {
              level: 'unknown',
              notes: undefined,
              confidence: 'low',
            },

            conditions: {
              overall: 'unknown',
              snow: 'none',
              mud: 'dry',
              bugs: 'none',
              notes: [],
            },

            source: 'osm',
            syncedAt: new Date().toISOString(),
          })

          upserted++
        } catch (e) {
          errors++
          context.warn(
            `OSM upsert failed for ${way.id}: ${
              e instanceof Error ? e.message : String(e)
            }`
          )
        }
      }

      // throttle between batches (CRITICAL for Azure + Overpass)
      await new Promise(r => setTimeout(r, 1500))
    }

    return {
      status: 200,
      jsonBody: {
        ok: true,
        upserted,
        errors,
      },
    }

  } catch (err) {
    context.error(
      `OSM sync fatal error: ${
        err instanceof Error ? err.message : String(err)
      }`
    )

    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

app.http('sync-osm', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: osmSyncHandler,
})