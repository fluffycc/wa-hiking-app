import { TrailMap } from '../components/map/TrailMap'
import { QuickFilterChips } from '../components/filters/QuickFilterChips'
import { useTrailStore } from '../state/useTrailStore'

export function MapPage() {
  const { searchQuery, setSearchQuery, filteredTrails } = useTrailStore()

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className="absolute top-3 left-3 right-3 z-20 space-y-2 pointer-events-none">
        <div className="relative pointer-events-auto">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search trails…"
            className="w-full bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl pl-9 pr-4 py-2.5 text-sm font-body shadow-card focus:outline-none focus:ring-2 focus:ring-trail-green/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
          )}
        </div>
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-card pointer-events-auto">
          <QuickFilterChips />
        </div>
        <div className="text-xs text-trail-stone font-body bg-white/80 backdrop-blur-sm rounded-full px-3 py-1 w-fit shadow-sm pointer-events-auto">
          {filteredTrails.length} trail{filteredTrails.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="flex-1 min-h-0" style={{ position: 'relative', zIndex: 0, isolation: 'isolate', height: '100%' }}>
        <TrailMap />
      </div>
    </div>
  )
}