import { create } from 'zustand'
import type { Trail } from '../domain/types'
import { filterTrails, searchTrails, sortTrails, DEFAULT_FILTERS } from '../domain/filters'
import type { FilterState, SortKey } from '../domain/filters'
import { fetchTrails } from '../services/trailsApi'

let _sampleData: Trail[] | null = null
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
  loadTrails:     () => Promise<void>
  setSearchQuery: (q: string) => void
  setSortKey:     (k: SortKey) => void
  setFilter:      <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  clearFilters:   () => void
}

function deriveFiltered(trails: Trail[], query: string, filters: FilterState, sort: SortKey): Trail[] {
  return sortTrails(filterTrails(searchTrails(trails, query), filters), sort)
}

export const useTrailStore = create<TrailStore>((set) => ({
  trails: [], loading: false, error: null,
  searchQuery: '', sortKey: 'relevance',
  activeFilters: { ...DEFAULT_FILTERS },
  filteredTrails: [], usingApi: false,

  loadTrails: async () => {
    set({ loading: true, error: null })
    try {
      const data = await fetchTrails(DEFAULT_FILTERS, '', 'relevance', 1, 500)
      const trails = data.trails
      set({ trails, filteredTrails: deriveFiltered(trails, '', DEFAULT_FILTERS, 'relevance'), loading: false, usingApi: true })
    } catch {
      try {
        const trails = await loadSampleData()
        set({ trails, filteredTrails: deriveFiltered(trails, '', DEFAULT_FILTERS, 'relevance'), loading: false, usingApi: false })
      } catch {
        set({ loading: false, error: 'Could not load trails', trails: [], filteredTrails: [] })
      }
    }
  },

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
