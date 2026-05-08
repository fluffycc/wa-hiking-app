import { useEffect, useRef, useState } from 'react'
import { TrailMap } from '../components/map/TrailMap'
import { QuickFilterChips } from '../components/filters/QuickFilterChips'
import { useTrailStore } from '../state/useTrailStore'
import { useUiStore } from '../state/useUiStore'
import { ErrorState } from '../components/ui/LoadingSpinner'
import { DEFAULT_FILTERS } from '../domain/filters'
import { fetchTrails } from '../services/trailsApi'
import type { Trail } from '../domain/types'

const suggestionCache = new Map<string, Trail[]>()

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/\btwenty two\b/g, '22')
    .replace(/\btwenty[-\s]?two\b/g, '22')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeTrailIdentity(value: string) {
  return normalizeSearch(value.replace(/\([^)]*\)/g, ''))
    .replace(/\btrail\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreSuggestion(query: string, trail: Trail) {
  const q = normalizeSearch(query)
  const name = normalizeSearch(trail.name)
  const words = name.split(' ')

  if (name === q) return 0
  if (name.startsWith(q)) return 1
  if (words.some(word => word.startsWith(q))) return 2
  if (name.includes(` ${q} `) || name.endsWith(` ${q}`)) return 3
  if (name.includes(q)) return 4
  return 99
}

function suggestionLocationKey(trail: Trail) {
  return `${normalizeTrailIdentity(trail.name)}|${trail.region}`
}

function trailDataQuality(trail: Trail) {
  let score = 0
  if (trail.parking.type !== 'unknown') score += 2
  if (trail.access.level !== 'unknown') score += 2
  if (trail.roadCondition?.condition && trail.roadCondition.condition !== 'unknown') score += 1
  if (trail.source === 'wta') score += 4
  if (trail.source === 'wadnr' || trail.source === 'wa_parks') score += 1
  if (trail.source === 'osm') score -= 1
  return score
}

function rankSuggestions(query: string, results: Trail[]) {
  const ranked = [...results]
    .filter(trail => scoreSuggestion(query, trail) < 99)
    .sort((a, b) => {
      const scoreDiff = scoreSuggestion(query, a) - scoreSuggestion(query, b)
      if (scoreDiff !== 0) return scoreDiff
      const qualityDiff = trailDataQuality(b) - trailDataQuality(a)
      if (qualityDiff !== 0) return qualityDiff
      const lengthDiff = a.name.length - b.name.length
      if (lengthDiff !== 0) return lengthDiff
      return a.name.localeCompare(b.name)
    })

  const seen = new Set<string>()
  const unique: Trail[] = []
  for (const trail of ranked) {
    const key = suggestionLocationKey(trail)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(trail)
    if (unique.length >= 8) break
  }

  return unique
}

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
  const [searchComplete, setSearchComplete] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchSeqRef = useRef(0)

  useEffect(() => {
    const query = mapSearch.trim()
    const requestSeq = ++searchSeqRef.current

    if (query.length < 2) {
      setSuggestions([])
      setSearchLoading(false)
      setSearchComplete(false)
      return
    }

    setSearchOpen(true)
    setSearchComplete(false)
    const cacheKey = normalizeSearch(query)
    const localSuggestions = rankSuggestions(query, trails)
    setSuggestions(localSuggestions)

    const cachedSuggestions = suggestionCache.get(cacheKey)
    if (cachedSuggestions) {
      setSuggestions(rankSuggestions(query, [...localSuggestions, ...cachedSuggestions]))
      setSearchComplete(true)
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setSearchLoading(true)
      fetchTrails(DEFAULT_FILTERS, query, 'relevance', 1, 25, undefined, controller.signal)
        .then(data => {
          if (requestSeq !== searchSeqRef.current) return
          suggestionCache.set(cacheKey, data.trails)
          setSuggestions(rankSuggestions(query, [...localSuggestions, ...data.trails]))
          setSearchComplete(true)
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (requestSeq === searchSeqRef.current) {
            setSuggestions(localSuggestions)
            setSearchComplete(true)
          }
        })
        .finally(() => {
          if (requestSeq === searchSeqRef.current) setSearchLoading(false)
        })
    }, 90)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [mapSearch, trails])

  if (error && !trails.length)   return <ErrorState message={error} onRetry={() => void loadTrails()} />

  const trailCountLabel = loading && !trails.length
    ? 'Finding nearby trails'
    : usingApi
    ? hasMore
      ? `Showing ${filteredTrails.length} trails in this area`
      : `${filteredTrails.length} trails in view`
    : `${filteredTrails.length} sample trails`
  const showSearchDropdown = searchOpen && mapSearch.trim().length >= 2 && (suggestions.length > 0 || searchLoading || searchComplete)

  const selectSuggestion = (trail: Trail) => {
    focusTrail(trail)
    setSelectedTrailId(trail.id)
    setMapSearch(trail.name)
    setSuggestions([])
    setSearchOpen(false)
  }

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className="absolute top-3 left-3 right-3 z-20 space-y-2 pointer-events-none">
        <div className="relative z-50 pointer-events-auto">
          <input
            value={mapSearch}
            onChange={e => { setSearchOpen(true); setMapSearch(e.target.value) }}
            onFocus={() => { if (mapSearch.trim().length >= 2) setSearchOpen(true) }}
            placeholder="Search trail by name..."
            className="w-full bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl pl-4 pr-9 py-2.5 text-sm font-body shadow-card focus:outline-none focus:ring-2 focus:ring-trail-green/30"
          />
          {mapSearch && (
            <button
              onClick={() => { setMapSearch(''); setSuggestions([]); setSearchComplete(false); setSearchOpen(false) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              x
            </button>
          )}

          {showSearchDropdown && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[60vh] overflow-y-auto bg-white/98 backdrop-blur-sm border border-gray-100 rounded-2xl shadow-sheet">
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
              {!searchLoading && searchComplete && suggestions.length === 0 && (
                <div className="px-3 py-3 text-sm text-trail-stone">
                  No matching trails yet
                </div>
              )}
            </div>
          )}
        </div>

        {!showSearchDropdown && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-card pointer-events-auto">
            <QuickFilterChips />
          </div>
        )}

        {!showSearchDropdown && (
          <div className="flex gap-2 items-center pointer-events-auto flex-wrap">
            <div className="text-xs text-trail-stone font-body bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
              {trailCountLabel}
            </div>
            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-trail-green font-body bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
                <span className="w-3 h-3 rounded-full border-2 border-trail-green/20 border-t-trail-green animate-spin" />
                {trails.length ? 'Updating area' : 'Loading trails'}
              </div>
            )}
            {!usingApi && !loading && (
              <div className="text-xs text-amber-700 font-body bg-amber-50/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
                Sample data - set up Cosmos DB for live trails
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0" style={{ position: 'relative', zIndex: 0, isolation: 'isolate', height: '100%' }}>
        <TrailMap />
      </div>
    </div>
  )
}
