import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../shared/cosmosClient'

const CACHE_CONTROL = 'public, max-age=120, s-maxage=300, stale-while-revalidate=600'
const RESPONSE_CACHE_TTL_MS = 2 * 60 * 1000
const RESPONSE_CACHE_MAX_ENTRIES = 200

interface CachedTrailsResponse {
  cachedAt: number
  body: unknown
}

const responseCache = new Map<string, CachedTrailsResponse>()

function getRequestCacheKey(req: HttpRequest): string {
  const url = new URL(req.url)
  return [...url.searchParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

function rememberResponse(key: string, body: unknown): void {
  responseCache.set(key, { cachedAt: Date.now(), body })
  if (responseCache.size <= RESPONSE_CACHE_MAX_ENTRIES) return

  const oldestKey = responseCache.keys().next().value
  if (oldestKey) responseCache.delete(oldestKey)
}

async function trailsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const p = Object.fromEntries(new URL(req.url).searchParams)
  const page   = Math.max(1, parseInt(p['page']  ?? '1'))
  const limit  = Math.min(100, Math.max(1, parseInt(p['limit'] ?? '50')))
  const offset = (page - 1) * limit
  const fetchLimit = limit + 1
  const hasBounds = !!(p['north'] && p['south'] && p['east'] && p['west'])
  const requestCacheKey = getRequestCacheKey(req)
  const cached = responseCache.get(requestCacheKey)

  if (cached && Date.now() - cached.cachedAt < RESPONSE_CACHE_TTL_MS) {
    return {
      status: 200,
      headers: {
        'Cache-Control': CACHE_CONTROL,
        'X-Cache': 'HIT',
      },
      jsonBody: cached.body,
    }
  }

  const conditions: string[] = []
  const params: { name: string; value: unknown }[] = []

  if (p['region']) {
    const regions = p['region'].split(',').map((r: string, i: number) => {
      params.push({ name: `@region${i}`, value: r.trim() })
      return `@region${i}`
    })
    conditions.push(`t.region IN (${regions.join(', ')})`)
  }
  if (hasBounds) {
    conditions.push('t.lat >= @south AND t.lat <= @north AND t.lng >= @west AND t.lng <= @east')
    params.push(
      { name: '@north', value: parseFloat(p['north']) },
      { name: '@south', value: parseFloat(p['south']) },
      { name: '@east',  value: parseFloat(p['east']) },
      { name: '@west',  value: parseFloat(p['west']) },
    )
  }
  if (p['condition'] && p['condition'] !== 'any') { conditions.push('t.conditions.overall = @condition'); params.push({ name: '@condition', value: p['condition'] }) }
  if (p['access']    && p['access']    !== 'any') { conditions.push('t.access.level = @access');          params.push({ name: '@access',    value: p['access'] }) }
  if (p['parking']   && p['parking']   !== 'any') { conditions.push('t.parking.type = @parking');         params.push({ name: '@parking',   value: p['parking'] }) }
  if (p['maxMiles'])   { conditions.push('t.miles <= @maxMiles');             params.push({ name: '@maxMiles',  value: parseFloat(p['maxMiles']) }) }
  if (p['difficulty']) {
    const diffs = p['difficulty'].split(',').map((d: string, i: number) => {
      params.push({ name: `@diff${i}`, value: d.trim() })
      return `@diff${i}`
    })
    conditions.push(`t.difficulty IN (${diffs.join(', ')})`)
  }
  if (p['q']) {
    conditions.push('(CONTAINS(LOWER(t.name), @q) OR CONTAINS(LOWER(t.region), @q))')
    params.push({ name: '@q', value: p['q'].toLowerCase() })
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const sortMap: Record<string, string> = {
    miles_asc: 't.miles ASC', elevation_asc: 't.elevationGainFt ASC',
    name_asc: 't.name ASC', relevance: 't._ts DESC',
  }
  const orderBy = sortMap[p['sort'] ?? 'relevance'] ?? 't._ts DESC'

  try {
    const container = getTrailsContainer()
    const useFastViewportQuery = hasBounds && offset === 0 && (p['sort'] ?? 'relevance') === 'relevance'
    const query = useFastViewportQuery
      ? `SELECT TOP ${fetchLimit} * FROM t ${where}`
      : `SELECT * FROM t ${where} ORDER BY ${orderBy} OFFSET ${offset} LIMIT ${fetchLimit}`
    const dataRes = await container.items.query(
      { query, parameters: params },
      { enableCrossPartitionQuery: true }
    ).fetchAll()
    const trails = dataRes.resources.slice(0, limit)
    const hasMore = dataRes.resources.length > limit
    const body = { trails, total: offset + trails.length, page, limit, hasMore }
    rememberResponse(requestCacheKey, body)

    return {
      status: 200,
      headers: {
        'Cache-Control': CACHE_CONTROL,
        'X-Cache': 'MISS',
      },
      jsonBody: body,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    context.error('GET /api/trails error', message)
    return { status: 500, jsonBody: { ok: false, error: message } }
  }
}

app.http('trails', { methods: ['GET'], authLevel: 'anonymous', handler: trailsHandler })
