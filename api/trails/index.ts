import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../shared/cosmosClient'

const CACHE_CONTROL = 'public, max-age=120, s-maxage=300, stale-while-revalidate=600'
const RESPONSE_CACHE_TTL_MS = 2 * 60 * 1000
const RESPONSE_CACHE_MAX_ENTRIES = 200

interface CachedTrailsResponse {
  cachedAt: number
  body: unknown
}

type TrailDoc = Record<string, any>

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

function normalizeTrailName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)/g, '')
    .replace(/\btrail\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function trailKey(trail: TrailDoc): string {
  return `${normalizeTrailName(trail.name)}|${String(trail.region ?? '')}`
}

function trailQuality(trail: TrailDoc): number {
  let score = 0
  if (trail.parking?.type && trail.parking.type !== 'unknown') score += 4
  if (trail.access?.level && trail.access.level !== 'unknown') score += 2
  if (trail.roadCondition?.condition && trail.roadCondition.condition !== 'unknown') score += 1
  if (trail.wta?.status === 'matched') score += 4
  if (trail.source === 'wadnr' || trail.source === 'wa_parks') score += 2
  if (trail.source === 'osm') score -= 1
  return score
}

function searchScore(query: string | undefined, trail: TrailDoc): number {
  if (!query) return 0

  const q = normalizeTrailName(query)
  const name = normalizeTrailName(trail.name)
  const words = name.split(' ')

  if (name === q) return 0
  if (name.startsWith(q)) return 1
  if (words.some(word => word.startsWith(q))) return 2
  if (name.includes(` ${q} `) || name.endsWith(` ${q}`)) return 3
  if (name.includes(q)) return 4
  return 99
}

function uniqueTrails(resources: TrailDoc[], query: string | undefined, limit: number): TrailDoc[] {
  const bestByKey = new Map<string, TrailDoc>()

  for (const trail of resources) {
    const key = trailKey(trail)
    if (!key.trim()) continue

    const existing = bestByKey.get(key)
    if (!existing || trailQuality(trail) > trailQuality(existing)) {
      bestByKey.set(key, trail)
    }
  }

  const trails = [...bestByKey.values()]
  if (query) {
    trails.sort((a, b) => {
      const scoreDiff = searchScore(query, a) - searchScore(query, b)
      if (scoreDiff !== 0) return scoreDiff

      const qualityDiff = trailQuality(b) - trailQuality(a)
      if (qualityDiff !== 0) return qualityDiff

      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })
  }

  return trails.slice(0, limit)
}

async function trailsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const p = Object.fromEntries(new URL(req.url).searchParams)
  const page   = Math.max(1, parseInt(p['page']  ?? '1'))
  const limit  = Math.min(100, Math.max(1, parseInt(p['limit'] ?? '50')))
  const offset = (page - 1) * limit
  const hasBounds = !!(p['north'] && p['south'] && p['east'] && p['west'])
  const rawFetchLimit = p['q']
    ? Math.min(180, limit * 3 + 1)
    : hasBounds
      ? Math.min(160, limit + 61)
      : limit + 1
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
    const useFastFirstPageQuery = offset === 0 && (p['sort'] ?? 'relevance') === 'relevance'
    const query = useFastFirstPageQuery
      ? `SELECT TOP ${rawFetchLimit} * FROM t ${where}`
      : `SELECT * FROM t ${where} ORDER BY ${orderBy} OFFSET ${offset} LIMIT ${rawFetchLimit}`
    const dataRes = await container.items.query(
      { query, parameters: params },
      { enableCrossPartitionQuery: true }
    ).fetchAll()
    const trails = uniqueTrails(dataRes.resources, p['q'], limit)
    const hasMore = dataRes.resources.length > trails.length
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
