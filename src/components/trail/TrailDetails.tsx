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

const SURFACE_LABEL: Record<string, string> = {
  paved: 'Paved',
  gravel: 'Gravel',
  dirt: 'Dirt',
  unknown: 'Unknown',
}

const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  rough: 'Rough',
  very_rough: 'Very rough',
  unknown: 'Unknown',
}

const DNR_LEVEL_LABEL: Record<number, string> = {
  2: 'High clearance only',
  3: 'Passenger car (gravel)',
  4: 'Passenger car (paved)',
  5: 'Paved highway',
}

function alertSuggestsClosureOrSnow(message: string): boolean {
  return /\b(closed|closure|impassable|snow|avalanche|winter)\b/i.test(message)
}

function hasSnowOrClosureRisk(trail: Trail, activeAlerts: NonNullable<Trail['alerts']>): boolean {
  return (
    trail.conditions.snow === 'significant' ||
    activeAlerts.some(alert => alert.type === 'closure' || alertSuggestsClosureOrSnow(alert.message))
  )
}

function RoadConditionBlock({
  road,
  showConfidenceWarning,
}: {
  road: RoadCondition
  showConfidenceWarning: boolean
}) {
  return (
    <div className="bg-stone-50 border border-stone-100 rounded-xl p-3 space-y-2">
      <div className="flex gap-3 flex-wrap">
        <span className="text-sm">
          Surface: <strong>{SURFACE_LABEL[road.surface] ?? road.surface}</strong>
        </span>
        <span className="text-sm">
          Condition: <strong>{CONDITION_LABEL[road.condition] ?? road.condition.replace('_', ' ')}</strong>
        </span>
      </div>
      {road.dnrMaintenanceLevel && (
        <p className="text-xs text-trail-stone">
          WA DNR Level {road.dnrMaintenanceLevel}: {DNR_LEVEL_LABEL[road.dnrMaintenanceLevel]}
        </p>
      )}
      {road.notes && <p className="text-sm text-trail-stone">{road.notes}</p>}
      {showConfidenceWarning && (
        <p className="text-xs text-amber-600">Low confidence: snow or closure may affect access. Verify before going.</p>
      )}
    </div>
  )
}

export function TrailDetails({ trail }: Props) {
  const { isSaved, toggleSaved } = useSavedStore()
  const saved = isSaved(trail.id)
  const activeAlerts = trail.alerts?.filter(a => !a.expiresISO || new Date(a.expiresISO) > new Date()) ?? []
  const showAccessConfidenceWarning = hasSnowOrClosureRisk(trail, activeAlerts)

  return (
    <div className="font-body">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-gray-100">
        <div>
          <h2 className="font-display font-bold text-trail-dark text-lg leading-tight">{trail.name}</h2>
          <p className="text-sm text-trail-stone mt-0.5">{trail.region} / {trail.landOwner}</p>
          {trail.source && (
            <span className="text-xs text-gray-400 mt-0.5 block capitalize">Source: {trail.source.replace('_', ' ')}</span>
          )}
        </div>
        <button
          onClick={() => toggleSaved(trail.id)}
          className="flex-shrink-0 min-w-12 h-10 rounded-full bg-gray-50 px-3 text-xs font-semibold text-trail-dark hover:bg-gray-100 transition-colors"
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {activeAlerts.length > 0 && (
        <div className="py-3 space-y-2">
          {activeAlerts.map((alert, i) => (
            <div key={i} className={`rounded-xl px-3 py-2 text-sm border
              ${alert.type === 'closure' ? 'bg-red-50 border-red-200 text-red-800' :
                alert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                'bg-blue-50 border-blue-200 text-blue-800'}`}>
              <strong className="capitalize">{alert.type}:</strong> {alert.message}
              <span className="text-xs opacity-60 ml-1">- {alert.source}</span>
            </div>
          ))}
        </div>
      )}

      <Section title="Today at a Glance">
        <BadgeRow trail={trail} />
        {trail.conditions.weatherHint && (
          <p className="mt-2 text-sm text-trail-stone bg-amber-50 rounded-lg px-3 py-2">
            {trail.conditions.weatherHint}
          </p>
        )}
      </Section>

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
                <span className="text-trail-amber">-</span>{note}
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

      <Section title="Access / Road to Trailhead">
        {trail.roadCondition ? (
          <RoadConditionBlock
            road={trail.roadCondition}
            showConfidenceWarning={showAccessConfidenceWarning}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-trail-dark capitalize">
              {trail.access.level.replace(/_/g, ' ')}
            </span>
            {showAccessConfidenceWarning && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Low confidence</span>
            )}
          </div>
        )}
        {trail.access.notes && !trail.roadCondition && (
          <p className="text-sm text-trail-stone mt-1">{trail.access.notes}</p>
        )}
      </Section>

      <Section title="Parking & Passes">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-sm font-semibold text-trail-dark capitalize">
            {trail.parking.type.replace(/_/g, ' ')}
          </p>
          {trail.parking.notes && (
            <p className="text-sm text-trail-stone mt-1">{trail.parking.notes}</p>
          )}
        </div>
      </Section>

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

      <Section title="Recent Trip Reports">
        <p className="text-sm text-trail-stone italic">No reports yet. Be the first!</p>
      </Section>
    </div>
  )
}
