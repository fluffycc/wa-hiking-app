import { useEffect } from 'react'
import { TrailMap } from '../components/map/TrailMap'
import { QuickFilterChips } from '../components/filters/QuickFilterChips'
import { useTrailStore } from '../state/useTrailStore'
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner'

export function MapPage() {
  const {
    searchQuery,
    setSearchQuery,
    filteredTrails,
    loading,
    error,
    loadTrails,
    trails,
    usingApi,
    hasMore,
  } = useTrailStore()

  useEffect(() => {
    if (!trails.length) loadTrails()
  }, [loadTrails, trails.length])

  if (loading && !trails.length) return <LoadingSpinner message="Loading WA trails…" />
  if (error && !trails.length)   return <ErrorState message={error} onRetry={() => void loadTrails()} />

  const trailCountLabel = usingApi
    ? hasMore
      ? `Showing ${filteredTrails.length} trails in this area`
      : `${filteredTrails.length} trails in view`
    : `${filteredTrails.length} sample trails`

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className="absolute top-3 left-3 right-3 z-20 space-y-2 pointer-events-none">
        <div className="relative pointer-events-auto">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search trails…"
            className="w-full bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl pl-9 pr-4 py-2.5 text-sm font-body shadow-card focus:outline-none focus:ring-2 focus:ring-trail-green/30" />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">✕</button>
          )}
        </div>
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-card pointer-events-auto">
          <QuickFilterChips />
        </div>
        <div className="flex gap-2 items-center pointer-events-auto">
          <div className="text-xs text-trail-stone font-body bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
            {trailCountLabel}
          </div>
          {!usingApi && (
            <div className="text-xs text-amber-700 font-body bg-amber-50/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
              📦 Sample data — set up Cosmos DB for live trails
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0" style={{ position: 'relative', zIndex: 0, isolation: 'isolate', height: '100%' }}>
        <TrailMap />
      </div>
    </div>
  )
}
