import { useUiStore } from '../../state/useUiStore'
import { useTrailStore } from '../../state/useTrailStore'
import { TrailDetails } from '../trail/TrailDetails'
import { TrailCard } from '../trail/TrailCard'

export function TrailBottomSheet() {
  const { selectedTrailId, setSelectedTrailId, bottomSheetState, setBottomSheetState } = useUiStore()
  const { filteredTrails } = useTrailStore()
  const trail = filteredTrails.find(t => t.id === selectedTrailId)

  if (bottomSheetState === 'hidden' || !trail) return null

  const isExpanded = bottomSheetState === 'expanded'

  return (
    <div
      className={`absolute bottom-16 left-0 right-0 z-30 bg-trail-bg rounded-t-3xl shadow-sheet transition-all duration-300
        ${isExpanded ? 'top-16' : 'h-52'}`}
    >
      {/* Drag handle */}
      <div
        className="flex justify-center pt-3 pb-2 cursor-pointer"
        onClick={() => setBottomSheetState(isExpanded ? 'preview' : 'expanded')}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>

      {isExpanded ? (
        /* Expanded — full details */
        <div className="overflow-y-auto h-[calc(100%-3rem)] px-5 pb-8">
          <TrailDetails trail={trail} />
        </div>
      ) : (
        /* Preview — card + tap to expand */
        <div className="px-4" onClick={() => setBottomSheetState('expanded')}>
          <TrailCard trail={trail} selected />
          <p className="text-center text-xs text-trail-stone mt-2 font-body">Tap to see full details ↑</p>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={() => setSelectedTrailId(null)}
        className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-sm text-gray-500 shadow-sm hover:bg-white"
      >
        ✕
      </button>
    </div>
  )
}
