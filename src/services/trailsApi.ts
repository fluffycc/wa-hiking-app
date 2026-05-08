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

  const res = await fetch(`/api/trails?${params}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<TrailsApiResponse>
}

export async function fetchTrailById(id: string): Promise<Trail> {
  const res = await fetch(`/api/trail?id=${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Trail not found: ${id}`)
  return res.json() as Promise<Trail>
}
