import { create } from 'zustand'
import type { Trail } from '../domain/types'
import { filterTrails, searchTrails, sortTrails, DEFAULT_FILTERS } from '../domain/filters'
import type { FilterState, SortKey } from '../domain/filters'
import trailsData from '../data/trails.sample.json'

interface TrailStore {
  trails: Trail[]
  searchQuery: string
  setSearchQuery: (q: string) => void
  activeFilters: FilterState
  sortKey: SortKey
  setSortKey: (k: SortKey) => void
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  clearFilters: () => void
  filteredTrails: Trail[]
}

function derive(trails: Trail[], query: string, filters: FilterState, sortKey: SortKey): Trail[] {
  return sortTrails(filterTrails(searchTrails(trails, query), filters), sortKey)
}

export const useTrailStore = create<TrailStore>((set, get) => ({
  trails: trailsData as Trail[],
  searchQuery: '',
  sortKey: 'relevance',
  activeFilters: { ...DEFAULT_FILTERS },

  setSearchQuery: (searchQuery) => set((s) => ({
    searchQuery,
    filteredTrails: derive(s.trails, searchQuery, s.activeFilters, s.sortKey),
  })),

  setSortKey: (sortKey) => set((s) => ({
    sortKey,
    filteredTrails: derive(s.trails, s.searchQuery, s.activeFilters, sortKey),
  })),

  setFilter: (key, value) => set((s) => {
    const activeFilters = { ...s.activeFilters, [key]: value }
    return { activeFilters, filteredTrails: derive(s.trails, s.searchQuery, activeFilters, s.sortKey) }
  }),

  clearFilters: () => set((s) => ({
    activeFilters: { ...DEFAULT_FILTERS },
    filteredTrails: derive(s.trails, s.searchQuery, DEFAULT_FILTERS, s.sortKey),
  })),

  filteredTrails: derive(trailsData as Trail[], '', DEFAULT_FILTERS, 'relevance'),
}))
