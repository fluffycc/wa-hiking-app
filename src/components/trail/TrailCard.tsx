import { BadgeRow } from './BadgeRow'
import type { Trail } from '../../domain/types'
import { useSavedStore } from '../../state/useSavedStore'

interface Props {
  trail: Trail
  onClick?: () => void
  selected?: boolean
}

function difficultyClass(difficulty: Trail['difficulty']) {
  if (difficulty === 'Easy') return 'text-green-600'
  if (difficulty === 'Moderate') return 'text-amber-600'
  if (difficulty === 'Hard') return 'text-orange-600'
  return 'text-red-600'
}

export function TrailCard({ trail, onClick, selected = false }: Props) {
  const { isSaved, toggleSaved } = useSavedStore()
  const saved = isSaved(trail.id)
  const statsPending = trail.statsConfidence === 'low'

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white border transition-all duration-150 cursor-pointer shadow-card hover:shadow-md active:scale-[0.98]
        ${selected ? 'border-trail-green ring-2 ring-trail-green/20' : 'border-gray-100'}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-trail-dark text-sm leading-tight truncate">{trail.name}</h3>
            <p className="text-xs text-trail-stone font-body mt-0.5">{trail.region}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); toggleSaved(trail.id) }}
            className="flex-shrink-0 min-w-12 h-8 rounded-full px-2 flex items-center justify-center hover:bg-gray-50 transition-colors"
            aria-label={saved ? 'Remove from saved' : 'Save trail'}
          >
            <span className="text-xs font-semibold">{saved ? 'Saved' : 'Save'}</span>
          </button>
        </div>

        <BadgeRow trail={trail} size="sm" />

        {!statsPending && (
          <div className="flex items-center gap-3 mt-3 text-xs text-trail-stone font-body">
            <span>{trail.miles} mi</span>
            <span>{trail.elevationGainFt.toLocaleString()} ft gain</span>
            <span className={`font-medium ${difficultyClass(trail.difficulty)}`}>{trail.difficulty}</span>
            <span className="text-gray-300">|</span>
            <span>{trail.routeType}</span>
          </div>
        )}
      </div>
    </div>
  )
}
