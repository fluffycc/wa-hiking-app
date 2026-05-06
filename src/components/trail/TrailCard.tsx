import { BadgeRow } from './BadgeRow'
import type { Trail } from '../../domain/types'
import { useSavedStore } from '../../state/useSavedStore'

interface Props {
  trail: Trail
  onClick?: () => void
  selected?: boolean
}

export function TrailCard({ trail, onClick, selected = false }: Props) {
  const { isSaved, toggleSaved } = useSavedStore()
  const saved = isSaved(trail.id)

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
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
            aria-label={saved ? 'Remove from saved' : 'Save trail'}
          >
            <span className="text-base">{saved ? '❤️' : '🤍'}</span>
          </button>
        </div>

        <BadgeRow trail={trail} size="sm" />

        <div className="flex items-center gap-3 mt-3 text-xs text-trail-stone font-body">
          <span>📏 {trail.miles} mi</span>
          <span>⬆️ {trail.elevationGainFt.toLocaleString()} ft</span>
          <span className={`font-medium ${
            trail.difficulty === 'Easy' ? 'text-green-600' :
            trail.difficulty === 'Moderate' ? 'text-amber-600' :
            trail.difficulty === 'Hard' ? 'text-orange-600' : 'text-red-600'
          }`}>{trail.difficulty}</span>
          <span className="text-gray-300">•</span>
          <span>{trail.routeType === 'OutAndBack' ? '↔' : trail.routeType === 'Loop' ? '🔄' : '→'} {trail.routeType}</span>
        </div>
      </div>
    </div>
  )
}
