import { useState, useEffect } from 'react'
import { TrailCard } from '../components/trail/TrailCard'
import { QuickFilterChips } from '../components/filters/QuickFilterChips'
import { FilterSheet } from '../components/filters/FilterSheet'
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner'
import { useTrailStore } from '../state/useTrailStore'
import { useUiStore } from '../state/useUiStore'
import { countActiveFilters } from '../domain/filters'
import type { SortKey } from '../domain/filters'

export function ExploreListPage() {
  const { searchQuery, setSearchQuery, filteredTrails, activeFilters, sortKey, setSortKey, loading, error, loadTrails, trails } = useTrailStore()
  const { setSelectedTrailId, setActiveTab } = useUiStore()
  const [filterOpen, setFilterOpen] = useState(false)
  const filterCount = countActiveFilters(activeFilters)

  useEffect(() => {
    if (!trails.length) loadTrails()
  }, [])

  const handleTrailClick = (id: string) => {
    setSelectedTrailId(id)
    setActiveTab('map')
  }

  if (loading) return <LoadingSpinner message="Loading trails…" />
  if (error)   return <ErrorState message={error} onRetry={loadTrails} />

  return (
    <div className="flex flex-col h-full bg-trail-bg">
      <div className="px-4 pt-4 pb-3 space-y-2.5 border-b border-gray-100 bg-trail-bg">
        <div className="flex items-center gap-1">
          <h1 className="font-display font-bold text-trail-dark text-xl flex-1">Explore</h1>
          <span className="text-sm text-trail-stone font-body">{filteredTrails.length} trails</span>
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search trails or regions…"
            className="w-full bg-white border border-gray-200 rounded-2xl pl-9 pr-4 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-trail-green/30" />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">✕</button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0"><QuickFilterChips /></div>
          <button onClick={() => setFilterOpen(true)}
            className={`flex-shrink-0 text-xs font-body font-medium rounded-full px-3 py-1.5 border flex items-center gap-1 transition-all
              ${filterCount > 0 ? 'bg-trail-green text-white border-trail-green' : 'bg-white text-trail-dark border-gray-200'}`}>
            ⚙️ Filters{filterCount > 0 ? ` (${filterCount})` : ''}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-trail-stone font-body">Sort:</span>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="text-xs font-body border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
            <option value="relevance">Relevance</option>
            <option value="miles_asc">Miles (short first)</option>
            <option value="elevation_asc">Elevation (low first)</option>
            <option value="name_asc">Name A–Z</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {filteredTrails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">🌲</span>
            <p className="font-display font-semibold text-trail-dark">No trails match</p>
            <p className="text-sm text-trail-stone font-body mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          filteredTrails.map(trail => (
            <TrailCard key={trail.id} trail={trail} onClick={() => handleTrailClick(trail.id)} />
          ))
        )}
        <div className="h-4" />
      </div>

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} />
    </div>
  )
}
