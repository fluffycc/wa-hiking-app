import { TrailCard } from '../components/trail/TrailCard'
import { useTrailStore } from '../state/useTrailStore'
import { useSavedStore } from '../state/useSavedStore'
import { useUiStore } from '../state/useUiStore'

export function SavedPage() {
  const { trails } = useTrailStore()
  const { savedTrailIds, myPasses, setPass } = useSavedStore()
  const { setSelectedTrailId, setActiveTab } = useUiStore()
  const savedTrails = trails.filter(t => savedTrailIds.includes(t.id))

  const handleTrailClick = (id: string) => {
    setSelectedTrailId(id)
    setActiveTab('map')
  }

  return (
    <div className="flex flex-col h-full bg-trail-bg">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 bg-trail-bg">
        <h1 className="font-display font-bold text-trail-dark text-xl mb-4">Saved</h1>

        {/* My Passes */}
        <div>
          <p className="text-xs font-body font-medium text-trail-stone uppercase tracking-wide mb-2">My Passes</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'discoverPass' as const, label: '🏷 Discover Pass' },
              { key: 'nwForestPass' as const, label: '🌲 NW Forest Pass' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPass(key, !myPasses[key])}
                className={`text-sm font-body font-medium rounded-full px-3 py-1.5 border transition-all
                  ${myPasses[key]
                    ? 'bg-trail-green text-white border-trail-green'
                    : 'bg-white text-trail-dark border-gray-200'}`}
              >
                {myPasses[key] ? '✓ ' : ''}{label}
              </button>
            ))}
          </div>
          {(myPasses.discoverPass || myPasses.nwForestPass) && (
            <p className="text-xs text-trail-stone font-body mt-2">
              ✅ Trails requiring your pass{myPasses.discoverPass && myPasses.nwForestPass ? 'es' : ''} are shown with no extra cost warnings.
            </p>
          )}
        </div>
      </div>

      {/* Saved trails */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {savedTrails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">🤍</span>
            <p className="font-display font-semibold text-trail-dark text-lg">No saved trails yet</p>
            <p className="text-sm text-trail-stone font-body mt-1 max-w-xs">
              Tap the heart on any trail card to save it here for later.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-trail-stone font-body">{savedTrails.length} saved trail{savedTrails.length !== 1 ? 's' : ''}</p>
            {savedTrails.map(trail => (
              <TrailCard key={trail.id} trail={trail} onClick={() => handleTrailClick(trail.id)} />
            ))}
          </>
        )}
        <div className="h-4" />
      </div>
    </div>
  )
}
