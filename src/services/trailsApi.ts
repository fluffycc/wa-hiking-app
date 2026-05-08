import type { Trail } from '../domain/types'
import type { FilterState, SortKey } from '../domain/filters'

export interface TrailsApiResponse {
  trails:  Trail[]
  total:   number
  page:    number
  limit:   number
  hasMore: boolean
}

export interface TrailBounds {
  north: number
  south: number
  east:  number
  west:  number
}

const RESPONSE_CACHE_TTL_MS = 2 * 60 * 1000
const RESPONSE_CACHE_MAX_ENTRIES = 150
const responseCache = new Map<string, { cachedAt: number; data: TrailsApiResponse }>()

function rememberResponse(url: string, data: TrailsApiResponse) {
  responseCache.set(url, { cachedAt: Date.now(), data })
  if (responseCache.size <= RESPONSE_CACHE_MAX_ENTRIES) return

  const oldestKey = responseCache.keys().next().value
  if (oldestKey) responseCache.delete(oldestKey)
}

export async function fetchTrails(
  filters: FilterState,
  query:   string,
  sort:    SortKey,
  page   = 1,
  limit  = 100,
  bounds?: TrailBounds,
): Promise<TrailsApiResponse> {
  const params = new URLSearchParams()
  params.set('page',  String(page))
  params.set('limit', String(limit))
  params.set('sort',  sort)

  if (query.trim())                       params.set('q', query.trim())
  if (filters.conditionOverall !== 'any') params.set('condition', filters.conditionOverall)
  if (filters.accessLevel      !== 'any') params.set('access',    filters.accessLevel)
  if (filters.parkingType      !== 'any') params.set('parking',   filters.parkingType)
  if (filters.maxMiles         !== null)  params.set('maxMiles',  String(filters.maxMiles))
  if (filters.difficulty.length)          params.set('difficulty', filters.difficulty.join(','))
  if (filters.region.length)              params.set('region',     filters.region.join(','))
  if (bounds) {
    params.set('north', String(bounds.north))
    params.set('south', String(bounds.south))
    params.set('east',  String(bounds.east))
    params.set('west',  String(bounds.west))
  }

  const url = `/api/trails?${params}`
  const cached = responseCache.get(url)
  if (cached && Date.now() - cached.cachedAt < RESPONSE_CACHE_TTL_MS) return cached.data

  const res = await fetch(url)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json() as TrailsApiResponse
  rememberResponse(url, data)
  return data
}

export async function fetchTrailById(id: string): Promise<Trail> {
  const res = await fetch(`/api/trail?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Trail not found: ${id}`)
  return res.json() as Promise<Trail>
}
