import { useEffect, useState } from 'react'
import { useUiStore } from '../../state/useUiStore'
import { useTrailStore } from '../../state/useTrailStore'
import { fetchTrailById } from '../../services/trailsApi'
import type { Trail } from '../../domain/types'
import { TrailDetails } from '../trail/TrailDetails'
import { TrailCard } from '../trail/TrailCard'

export function TrailBottomSheet() {
  const { selectedTrailId, setSelectedTrailId, bottomSheetState, setBottomSheetState } = useUiStore()
  const { trails } = useTrailStore()
  const [detailedTrail, setDetailedTrail] = useState<Trail | null>(null)
  const trail = trails.find(t => t.id === selectedTrailId)
  const displayTrail = detailedTrail ?? trail

  useEffect(() => {
    if (!selectedTrailId) {
      setDetailedTrail(null)
      return
    }

    let active = true
    setDetailedTrail(null)
    fetchTrailById(selectedTrailId)
      .then(nextTrail => {
        if (active) setDetailedTrail(nextTrail)
      })
      .catch(() => {
        if (active) setDetailedTrail(null)
      })

    return () => {
      active = false
    }
  }, [selectedTrailId])

  if (bottomSheetState === 'hidden' || !displayTrail) return null

  const isExpanded = bottomSheetState === 'expanded'

  return (
    <div
      className={`fixed left-0 right-0 z-40 bg-trail-bg rounded-t-3xl shadow-sheet transition-all duration-300
        ${isExpanded ? 'bottom-sheet-expanded' : 'above-bottom-nav h-56'}`}
    >
      <div
        className="flex justify-center pt-3 pb-2 cursor-pointer"
        onClick={() => setBottomSheetState(isExpanded ? 'preview' : 'expanded')}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      {isExpanded ? (
        <div className="overflow-y-auto h-[calc(100%-3rem)] px-5 pb-8">
          <TrailDetails trail={displayTrail} />
        </div>
      ) : (
        <div className="px-4 cursor-pointer" onClick={() => setBottomSheetState('expanded')}>
          <TrailCard trail={displayTrail} selected />
          <p className="text-center text-xs text-trail-stone mt-2 font-body">Tap to see full details</p>
        </div>
      )}

      <button
        onClick={() => setSelectedTrailId(null)}
        className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-sm text-gray-500 shadow-sm hover:bg-white"
      >
        x
      </button>
    </div>
  )
}
