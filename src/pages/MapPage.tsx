import { useEffect, useRef, useState } from 'react'
import { TrailMap } from '../components/map/TrailMap'
import { QuickFilterChips } from '../components/filters/QuickFilterChips'
import { useTrailStore } from '../state/useTrailStore'
import { useUiStore } from '../state/useUiStore'
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner'
import { DEFAULT_FILTERS } from '../domain/filters'
import { fetchTrails } from '../services/trailsApi'
import type { Trail } from '../domain/types'

export function MapPage() {
  const {
    filteredTrails,
    loading,
    error,
    loadTrails,
    focusTrail,
    trails,
    usingApi,
    hasMore,
  } = useTrailStore()
  const { setSelectedTrailId } = useUiStore()
  const [mapSearch, setMapSearch] = useState('')
  const [suggestions, setSuggestions] = useState<Trail[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchSeqRef = useRef(0)

  useEffect(() => {
    if (!trails.length) loadTrails()
  }, [loadTrails, trails.length])

  useEffect(() => {
    const query = mapSearch.trim()
    const requestSeq = ++searchSeqRef.current

    if (query.length < 2) {
      setSuggestions([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    const timeout = window.setTimeout(() => {
      fetchTrails(DEFAULT_FILTERS, query, 'name_asc', 1, 8)
        .then(data => {
          if (requestSeq === searchSeqRef.current) setSuggestions(data.trails)
        })
        .catch(() => {
          if (requestSeq === searchSeqRef.current) setSuggestions([])
        })
        .finally(() => {
          if (requestSeq === searchSeqRef.current) setSearchLoading(false)
        })
    }, 220)

    return () => window.clearTimeout(timeout)
  }, [mapSearch])

  if (loading && !trails.length) return <LoadingSpinner message="Loading WA trails..." />
  if (error && !trails.length)   return <ErrorState message={error} onRetry={() => void loadTrails()} />

  const trailCountLabel = usingApi
    ? hasMore
      ? `Showing ${filteredTrails.length} trails in this area`
      : `${filteredTrails.length} trails in view`
    : `${filteredTrails.length} sample trails`

  const selectSuggestion = (trail: Trail) => {
    focusTrail(trail)
    setSelectedTrailId(trail.id)
    setMapSearch(trail.name)
    setSuggestions([])
  }

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className="absolute top-3 left-3 right-3 z-20 space-y-2 pointer-events-none">
        <div className="relative pointer-events-auto">
          <input
            value={mapSearch}
            onChange={e => setMapSearch(e.target.value)}
            placeholder="Search trail by name..."
            className="w-full bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl pl-4 pr-9 py-2.5 text-sm font-body shadow-card focus:outline-none focus:ring-2 focus:ring-trail-green/30"
          />
          {mapSearch && (
            <button
              onClick={() => { setMapSearch(''); setSuggestions([]) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              x
            </button>
          )}

          {(suggestions.length > 0 || searchLoading) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white/98 backdrop-blur-sm border border-gray-100 rounded-2xl shadow-sheet overflow-hidden">
              {searchLoading && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-trail-stone">
                  <span className="w-3 h-3 rounded-full border-2 border-trail-green/20 border-t-trail-green animate-spin" />
                  Searching trails
                </div>
              )}
              {suggestions.map(trail => (
                <button
                  key={trail.id}
                  onClick={() => selectSuggestion(trail)}
                  className="w-full text-left px-3 py-2.5 hover:bg-trail-green/5 border-t border-gray-50 first:border-t-0"
                >
                  <span className="block text-sm font-display font-semibold text-trail-dark truncate">{trail.name}</span>
                  <span className="block text-xs text-trail-stone">{trail.region} / {trail.miles} mi</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-card pointer-events-auto">
          <QuickFilterChips />
        </div>

        <div className="flex gap-2 items-center pointer-events-auto flex-wrap">
          <div className="text-xs text-trail-stone font-body bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
            {trailCountLabel}
          </div>
          {loading && trails.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-trail-green font-body bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
              <span className="w-3 h-3 rounded-full border-2 border-trail-green/20 border-t-trail-green animate-spin" />
              Updating area
            </div>
          )}
          {!usingApi && (
            <div className="text-xs text-amber-700 font-body bg-amber-50/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
              Sample data - set up Cosmos DB for live trails
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
