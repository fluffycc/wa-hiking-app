import { create } from 'zustand'
import type { Trail } from '../domain/types'
import { filterTrails, searchTrails, sortTrails, DEFAULT_FILTERS } from '../domain/filters'
import type { FilterState, SortKey } from '../domain/filters'
import { fetchTrails } from '../services/trailsApi'
import type { TrailBounds } from '../services/trailsApi'
import { useUiStore } from './useUiStore'

let _sampleData: Trail[] | null = null
let _loadSeq = 0
const VIEWPORT_TRAIL_LIMIT = 100
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

    set({
      loading: true,
      error: null,
      viewportBounds: nextBounds ?? null,
    })

    try {
      const latest = get()
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
      const selectedTrail = selectedTrailId
        ? get().trails.find(t => t.id === selectedTrailId) ?? state.trails.find(t => t.id === selectedTrailId)
        : undefined
      const selectedTrailInBounds = !!selectedTrail && (!nextBounds || trailIsWithinBounds(selectedTrail, nextBounds))
      const trailToKeep = selectedTrailInBounds ? selectedTrail : undefined

      if (selectedTrail && nextBounds && !selectedTrailInBounds) {
        useUiStore.getState().setSelectedTrailId(null)
      }

      const trails = trailToKeep && !data.trails.some(t => t.id === trailToKeep.id)
        ? [trailToKeep, ...data.trails].slice(0, VIEWPORT_TRAIL_LIMIT)
        : data.trails
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
