import type {
  Trail, ConditionOverall, AccessLevel,
  ParkingPassType, Difficulty, WARegion, RouteType,
} from './types'

export interface FilterState {
  conditionOverall: ConditionOverall | 'any'
  accessLevel:      AccessLevel | 'any'
  parkingType:      ParkingPassType | 'any'
  maxMiles:         number | null
  maxElevationGainFt: number | null
  difficulty:       Difficulty[]   // empty = all
  region:           WARegion[]     // empty = all
  routeType:        RouteType[]    // empty = all
}

export const DEFAULT_FILTERS: FilterState = {
  conditionOverall:   'any',
  accessLevel:        'any',
  parkingType:        'any',
  maxMiles:           null,
  maxElevationGainFt: null,
  difficulty:         [],
  region:             [],
  routeType:          [],
}

export function filterTrails(trails: Trail[], filters: FilterState): Trail[] {
  return trails.filter(trail => {
    if (filters.conditionOverall !== 'any' && trail.conditions.overall !== filters.conditionOverall) return false
    if (filters.accessLevel !== 'any' && trail.access.level !== filters.accessLevel) return false
    if (filters.parkingType !== 'any' && trail.parking.type !== filters.parkingType) return false
    if (filters.maxMiles !== null && trail.miles > filters.maxMiles) return false
    if (filters.maxElevationGainFt !== null && trail.elevationGainFt > filters.maxElevationGainFt) return false
    if (filters.difficulty.length > 0 && !filters.difficulty.includes(trail.difficulty)) return false
    if (filters.region.length > 0 && !filters.region.includes(trail.region)) return false
    if (filters.routeType.length > 0 && !filters.routeType.includes(trail.routeType)) return false
    return true
  })
}

export function searchTrails(trails: Trail[], query: string): Trail[] {
  if (!query.trim()) return trails
  const q = query.toLowerCase()
  return trails.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.region.toLowerCase().includes(q)
  )
}

export type SortKey = 'relevance' | 'miles_asc' | 'elevation_asc' | 'name_asc'

export function sortTrails(trails: Trail[], key: SortKey): Trail[] {
  const sorted = [...trails]
  switch (key) {
    case 'miles_asc':     return sorted.sort((a, b) => a.miles - b.miles)
    case 'elevation_asc': return sorted.sort((a, b) => a.elevationGainFt - b.elevationGainFt)
    case 'name_asc':      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    default:              return sorted
  }
}

export function countActiveFilters(filters: FilterState): number {
  let n = 0
  if (filters.conditionOverall !== 'any') n++
  if (filters.accessLevel !== 'any') n++
  if (filters.parkingType !== 'any') n++
  if (filters.maxMiles !== null) n++
  if (filters.maxElevationGainFt !== null) n++
  n += filters.difficulty.length
  n += filters.region.length
  n += filters.routeType.length
  return n
}
