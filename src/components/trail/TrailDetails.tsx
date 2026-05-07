import type { Trail, RoadCondition } from '../../domain/types'
import { BadgeRow } from './BadgeRow'
import { useSavedStore } from '../../state/useSavedStore'

interface Props { trail: Trail }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <h4 className="font-display font-semibold text-trail-dark text-sm mb-2">{title}</h4>
      {children}
    </div>
  )
}

const SURFACE_ICON: Record<string, string> = {
  paved: '🛣', gravel: '🪨', dirt: '🌿', unknown: '❓'
}
const CONDITION_ICON: Record<string, string> = {
  excellent: '🟢', good: '🟡', rough: '🟠', very_rough: '🔴', unknown: '⚪'
}
const DNR_LEVEL_LABEL: Record<number, string> = {
  2: 'High clearance only',
  3: 'Passenger car (gravel)',
  4: 'Passenger car (paved)',
  5: 'Paved highway',
}

function RoadConditionBlock({ road }: { road: RoadCondition }) {
  return (
    <div className="bg-stone-50 border border-stone-100 rounded-xl p-3 space-y-2">
      <div className="flex gap-3 flex-wrap">
        <span className="text-sm">
          {SURFACE_ICON[road.surface]} Surface: <strong className="capitalize">{road.surface}</strong>
        </span>
        <span className="text-sm">
          {CONDITION_ICON[road.condition]} Condition: <strong className="capitalize">{road.condition.replace('_', ' ')}</strong>
        </span>
      </div>
      {road.dnrMaintenanceLevel && (
        <p className="text-xs text-trail-stone">
          🏛 WA DNR Level {road.dnrMaintenanceLevel}: {DNR_LEVEL_LABEL[road.dnrMaintenanceLevel]}
        </p>
      )}
      {road.notes && <p className="text-sm text-trail-stone">{road.notes}</p>}
      {road.confidence !== 'high' && (
        <p className="text-xs text-amber-600">⚠️ Confidence: {road.confidence} — verify before going</p>
      )}
    </div>
  )
}

export function TrailDetails({ trail }: Props) {
  const { isSaved, toggleSaved } = useSavedStore()
  const saved = isSaved(trail.id)
  const activeAlerts = trail.alerts?.filter(a => !a.expiresISO || new Date(a.expiresISO) > new Date()) ?? []

  return (
    <div className="font-body">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-gray-100">
        <div>
          <h2 className="font-display font-bold text-trail-dark text-lg leading-tight">{trail.name}</h2>
          <p className="text-sm text-trail-stone mt-0.5">{trail.region} · {trail.landOwner}</p>
          {trail.source && (
            <span className="text-xs text-gray-400 mt-0.5 block capitalize">Source: {trail.source.replace('_', ' ')}</span>
          )}
        </div>
        <button onClick={() => toggleSaved(trail.id)}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <span className="text-xl">{saved ? '❤️' : '🤍'}</span>
        </button>
      </div>

      {/* Active alerts */}
      {activeAlerts.length > 0 && (
        <div className="py-3 space-y-2">
          {activeAlerts.map((alert, i) => (
            <div key={i} className={`rounded-xl px-3 py-2 text-sm border
              ${alert.type === 'closure' ? 'bg-red-50 border-red-200 text-red-800' :
                alert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                'bg-blue-50 border-blue-200 text-blue-800'}`}>
              {alert.type === 'closure' ? '🚫' : alert.type === 'warning' ? '⚠️' : 'ℹ️'} {alert.message}
              <span className="text-xs opacity-60 ml-1">— {alert.source}</span>
            </div>
          ))}
        </div>
      )}

      {/* 1. Today at a glance */}
      <Section title="Today at a Glance">
        <BadgeRow trail={trail} />
        {trail.conditions.weatherHint && (
          <p className="mt-2 text-sm text-trail-stone bg-amber-50 rounded-lg px-3 py-2">
            🌤 {trail.conditions.weatherHint}
          </p>
        )}
      </Section>

      {/* 2. Conditions */}
      <Section title="Conditions">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Snow', value: trail.conditions.snow },
            { label: 'Mud',  value: trail.conditions.mud },
            { label: 'Bugs', value: trail.conditions.bugs },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-2">
              <p className="text-xs text-trail-stone">{label}</p>
              <p className="text-sm font-medium text-trail-dark capitalize mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        {trail.conditions.notes.length > 0 && (
          <ul className="mt-3 space-y-1">
            {trail.conditions.notes.map((note, i) => (
              <li key={i} className="text-sm text-trail-stone flex gap-2">
                <span className="text-trail-amber">•</span>{note}
              </li>
            ))}
          </ul>
        )}
        {trail.conditions.lastUpdatedISO && (
          <p className="text-xs text-gray-400 mt-2">
            Updated {new Date(trail.conditions.lastUpdatedISO).toLocaleDateString()}
          </p>
        )}
      </Section>

      {/* 3. Access */}
      <Section title="Access / Road to Trailhead">
        {trail.roadCondition ? (
          <RoadConditionBlock road={trail.roadCondition} />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-trail-dark capitalize">
              {trail.access.level.replace(/_/g, ' ')}
            </span>
            {trail.access.confidence === 'low' && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Low confidence</span>
            )}
          </div>
        )}
        {trail.access.notes && !trail.roadCondition && (
          <p className="text-sm text-trail-stone mt-1">{trail.access.notes}</p>
        )}
      </Section>

      {/* 4. Parking & Passes */}
      <Section title="Parking & Passes">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-sm font-semibold text-trail-dark capitalize">
            {trail.parking.type.replace(/_/g, ' ')}
          </p>
          {trail.parking.notes && (
            <p className="text-sm text-trail-stone mt-1">{trail.parking.notes}</p>
          )}
          {trail.parking.confidence !== 'high' && (
            <p className="text-xs text-orange-600 mt-1">⚠️ Verify before you go — confidence is {trail.parking.confidence}</p>
          )}
        </div>
      </Section>

      {/* 5. Basics */}
      <Section title="Basics">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            { label: 'Distance',  value: `${trail.miles} miles` },
            { label: 'Elevation', value: `${trail.elevationGainFt.toLocaleString()} ft gain` },
            { label: 'Difficulty',value: trail.difficulty },
            { label: 'Route',     value: trail.routeType },
            { label: 'Land Owner',value: trail.landOwner },
            ...(trail.trailheadElevationFt ? [{ label: 'TH Elevation', value: `${trail.trailheadElevationFt.toLocaleString()} ft` }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-trail-stone">{label}</p>
              <p className="font-medium text-trail-dark mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        {trail.description && (
          <p className="mt-3 text-sm text-trail-stone leading-relaxed">{trail.description}</p>
        )}
      </Section>

      {/* 6. Trip reports */}
      <Section title="Recent Trip Reports">
        <p className="text-sm text-trail-stone italic">No reports yet. Be the first!</p>
      </Section>
    </div>
  )
}
