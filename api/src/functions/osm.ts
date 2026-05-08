import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { randomUUID } from 'crypto'
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

const USER_AGENT = 'WAHikingApp/1.0 (contact: you@example.com)'
const FETCH_TIMEOUT_MS = 180_000
const UPSERT_BATCH_SIZE = 25

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

function safeGetContainer(context: InvocationContext) {
  try {
    const container = getTrailsContainer()
    context.log('[OSM] Cosmos container initialized')
    return container
  } catch (e) {
    context.error('[OSM] Cosmos init failed', e)
    throw new Error('COSMOS_INIT_FAILED')
  }
}

async function safeFetch(url: string, body: string, context: InvocationContext) {
  const start = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    context.log(`[OSM] Fetching ${url}`)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body,
      signal: controller.signal,
    })

    const text = await res.text()
    const ms = Date.now() - start

    context.log(`[OSM] ${url} responded in ${ms}ms (${text.length} bytes)`)

    if (!res.ok) {
      throw new Error(`${url} HTTP ${res.status}`)
    }

    if (!text || text.length < 10) {
      throw new Error(`${url} empty response`)
    }

    try {
      return JSON.parse(text) as { elements: OsmElement[] }
    } catch {
      throw new Error(`${url} invalid JSON: ${text.slice(0, 200)}`)
    }

  } catch (e) {
    const ms = Date.now() - start
    context.warn(`[OSM] ${url} failed after ${ms}ms`, e)
    throw e
  } finally {
    clearTimeout(timeout)
  }
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

async function queryOverpass(
  query: string,
  context: InvocationContext
): Promise<{ elements: OsmElement[] }> {

  let lastError = ''

  for (const url of OVERPASS_INSTANCES) {
    try {
      return await safeFetch(url, `data=${encodeURIComponent(query)}`, context)
    } catch (e) {
      lastError = String(e)
      continue
    }
  }

  throw new Error(`All Overpass instances failed: ${lastError}`)
}

async function osmSyncHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {

  const requestId = randomUUID()
  const startTime = Date.now()

  try {
    context.log(`[OSM][${requestId}] START`)

    if (!validateSyncToken(req)) {
      return {
        status: 401,
        jsonBody: { ok: false, error: 'Unauthorized', requestId },
      }
    }

    const container = safeGetContainer(context)

    // optional Cosmos sanity check (non-fatal)
    try {
      await container.items.query('SELECT TOP 1 c.id FROM c').fetchAll()
      context.log(`[OSM][${requestId}] Cosmos OK`)
    } catch (e) {
      context.error(`[OSM][${requestId}] Cosmos query failed`, e)
    }

    const data = await queryOverpass(OSM_WAYS_QUERY, context)

    const ways = (data.elements ?? []).filter(
      e => e.type === 'way' && e.center && e.tags?.name
    )

    context.log(`[OSM][${requestId}] ways found: ${ways.length}`)

    let upserted = 0
    let errors = 0

    await runInBatches(ways, UPSERT_BATCH_SIZE, async (way) => {
        try {
          const tags = way.tags
          const center = way.center

          if (!tags?.name || !center) return

          const lat = center.lat
          const lng = center.lon

          const region = regionFromLatLng(lat, lng)
          const owner = operatorToLandOwner(tags.operator)

          const miles = tags.distance
            ? metersToMiles(parseFloat(tags.distance) * 1000)
            : 3.0

          await container.items.upsert({
            id: `osm-${way.id}`,
            pk: region,

            osmId: String(way.id),
            name: cleanName(tags.name),
            region,

            lat,
            lng,
            miles,
            elevationGainFt: 0,

            difficulty: osmSacScaleToDifficulty(tags.sac_scale ?? 'hiking'),
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
          context.warn(`[OSM][${requestId}] upsert failed`, e)
        }
    })

    const duration = Date.now() - startTime
    context.log(`[OSM][${requestId}] DONE in ${duration}ms`)

    return {
      status: 200,
      jsonBody: {
        ok: true,
        requestId,
        upserted,
        errors,
        durationMs: duration,
      },
    }

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    context.error(`[OSM][${requestId}] FATAL ERROR`, error)

    return {
      status: 500,
      jsonBody: {
        ok: false,
        requestId,
        error: error.message,
        stack: error.stack,
      },
    }
  }
}

app.http('sync-osm', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: osmSyncHandler,
})
