import { create } from 'zustand'
import type { Trail } from '../domain/types'
import { filterTrails, searchTrails, sortTrails, DEFAULT_FILTERS } from '../domain/filters'
import type { FilterState, SortKey } from '../domain/filters'
import { fetchTrails } from '../services/trailsApi'
import type { TrailBounds } from '../services/trailsApi'
import { useUiStore } from './useUiStore'

let _sampleData: Trail[] | null = null
let _loadSeq = 0
const VIEWPORT_TRAIL_LIMIT = 50
const VIEWPORT_CACHE_TTL_MS = 5 * 60 * 1000

interface TrailCacheEntry {
  data: {
    trails: Trail[]
    total: number
    hasMore: boolean
  }
  cachedAt: number
}

const _trailCache = new Map<string, TrailCacheEntry>()

async function loadSampleData(): Promise<Trail[]> {
  if (_sampleData) return _sampleData
  const m = await import('../data/trails.sample.json')
  _sampleData = m.default as Trail[]
  return _sampleData
}

interface TrailStore {
  trails:         Trail[]
  loading:        boolean
  error:          string | null
  searchQuery:    string
  activeFilters:  FilterState
  sortKey:        SortKey
  filteredTrails: Trail[]
  usingApi:       boolean
  totalTrails:    number
  hasMore:        boolean
  viewportBounds: TrailBounds | null
  loadTrails:     (bounds?: TrailBounds) => Promise<void>
  focusTrail:     (trail: Trail) => void
  setSearchQuery: (q: string) => void
  setSortKey:     (k: SortKey) => void
  setFilter:      <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  clearFilters:   () => void
}

function deriveFiltered(trails: Trail[], query: string, filters: FilterState, sort: SortKey): Trail[] {
  return sortTrails(filterTrails(searchTrails(trails, query), filters), sort)
}

function trailIsWithinBounds(trail: Trail, bounds: TrailBounds): boolean {
  return (
    trail.lat >= bounds.south &&
    trail.lat <= bounds.north &&
    trail.lng >= bounds.west &&
    trail.lng <= bounds.east
  )
}

function cacheKey(filters: FilterState, query: string, sort: SortKey, bounds?: TrailBounds): string {
  return JSON.stringify({
    filters,
    query: query.trim().toLowerCase(),
    sort,
    bounds: bounds
      ? {
          north: bounds.north,
          south: bounds.south,
          east: bounds.east,
          west: bounds.west,
        }
      : null,
  })
}

function mergeSelectedTrail(
  trails: Trail[],
  previousTrails: Trail[],
  selectedTrailId: string | null,
  bounds?: TrailBounds
): Trail[] {
  const selectedTrail = selectedTrailId
    ? previousTrails.find(t => t.id === selectedTrailId)
    : undefined
  const selectedTrailInBounds = !!selectedTrail && (!bounds || trailIsWithinBounds(selectedTrail, bounds))

  if (selectedTrail && bounds && !selectedTrailInBounds) {
    useUiStore.getState().setSelectedTrailId(null)
  }

  if (selectedTrailInBounds && !trails.some(t => t.id === selectedTrail.id)) {
    return [selectedTrail, ...trails].slice(0, VIEWPORT_TRAIL_LIMIT)
  }

  return trails
}

export const useTrailStore = create<TrailStore>((set, get) => ({
  trails: [], loading: false, error: null,
  searchQuery: '', sortKey: 'relevance',
  activeFilters: { ...DEFAULT_FILTERS },
  filteredTrails: [], usingApi: false,
  totalTrails: 0, hasMore: false, viewportBounds: null,

  loadTrails: async (bounds) => {
    const requestSeq = ++_loadSeq
    const state = get()
    const nextBounds = bounds ?? state.viewportBounds ?? undefined
    const key = cacheKey(state.activeFilters, state.searchQuery, state.sortKey, nextBounds)
    const cached = _trailCache.get(key)

    if (cached && Date.now() - cached.cachedAt < VIEWPORT_CACHE_TTL_MS) {
      const selectedTrailId = useUiStore.getState().selectedTrailId
      const trails = mergeSelectedTrail(cached.data.trails, state.trails, selectedTrailId, nextBounds)
      set({
        trails,
        filteredTrails: deriveFiltered(trails, state.searchQuery, state.activeFilters, state.sortKey),
        loading: false,
        error: null,
        viewportBounds: nextBounds ?? null,
        usingApi: true,
        totalTrails: cached.data.total,
        hasMore: cached.data.hasMore,
      })
      return
    }

    set({
      loading: true,
      error: null,
      viewportBounds: nextBounds ?? null,
    })

    try {
      const latest = get()
      const latestKey = cacheKey(latest.activeFilters, latest.searchQuery, latest.sortKey, nextBounds)

      const data = await fetchTrails(
        latest.activeFilters,
        latest.searchQuery,
        latest.sortKey,
        1,
        VIEWPORT_TRAIL_LIMIT,
        nextBounds,
      )
      if (requestSeq !== _loadSeq) return
      const selectedTrailId = useUiStore.getState().selectedTrailId
      _trailCache.set(latestKey, {
        data: {
          trails: data.trails,
          total: data.total,
          hasMore: data.hasMore,
        },
        cachedAt: Date.now(),
      })
      const trails = mergeSelectedTrail(data.trails, get().trails.length ? get().trails : state.trails, selectedTrailId, nextBounds)
      set({
        trails,
        filteredTrails: deriveFiltered(trails, latest.searchQuery, latest.activeFilters, latest.sortKey),
        loading: false,
        usingApi: true,
        totalTrails: data.total,
        hasMore: data.hasMore,
      })
    } catch {
      if (requestSeq !== _loadSeq) return
      if (get().trails.length) {
        set({ loading: false, error: 'Could not update trails for this map area' })
        return
      }

      try {
        const trails = await loadSampleData()
        if (requestSeq !== _loadSeq) return
        const latest = get()
        set({
          trails,
          filteredTrails: deriveFiltered(trails, latest.searchQuery, latest.activeFilters, latest.sortKey),
          loading: false,
          usingApi: false,
          totalTrails: trails.length,
          hasMore: false,
        })
      } catch {
        set({
          loading: false,
          error: 'Could not load trails',
          trails: [],
          filteredTrails: [],
          totalTrails: 0,
          hasMore: false,
        })
      }
    }
  },

  focusTrail: (trail) => set(s => {
    const trails = [trail, ...s.trails.filter(t => t.id !== trail.id)].slice(0, VIEWPORT_TRAIL_LIMIT)
    const filtered = deriveFiltered(trails, s.searchQuery, s.activeFilters, s.sortKey)
    return {
      trails,
      filteredTrails: filtered.some(t => t.id === trail.id) ? filtered : [trail, ...filtered],
      totalTrails: Math.max(s.totalTrails, trails.length),
    }
  }),

  setSearchQuery: (searchQuery) => set(s => ({
    searchQuery,
    filteredTrails: deriveFiltered(s.trails, searchQuery, s.activeFilters, s.sortKey),
  })),

  setSortKey: (sortKey) => set(s => ({
    sortKey,
    filteredTrails: deriveFiltered(s.trails, s.searchQuery, s.activeFilters, sortKey),
  })),

  setFilter: (key, value) => set(s => {
    const activeFilters = { ...s.activeFilters, [key]: value }
    return { activeFilters, filteredTrails: deriveFiltered(s.trails, s.searchQuery, activeFilters, s.sortKey) }
  }),

  clearFilters: () => set(s => ({
    activeFilters: { ...DEFAULT_FILTERS },
    filteredTrails: deriveFiltered(s.trails, s.searchQuery, DEFAULT_FILTERS, s.sortKey),
  })),
}))
