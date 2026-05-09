import type { ReactNode } from 'react'
import type { Trail, RoadCondition } from '../../domain/types'
import { useSavedStore } from '../../state/useSavedStore'

interface Props { trail: Trail }

function Section({ title, children }: { title: string; children: ReactNode }) {
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

const PARKING_LABEL: Record<string, string> = {
  free: 'No permit',
  discover_pass: 'Discover Pass',
  nw_forest_pass: 'NW Forest Pass',
  national_park_fee: 'Park fee',
  unknown: 'Unknown',
}

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'violet' | 'teal'

const GLANCE_TONE_CLASS: Record<Tone, string> = {
  green: 'bg-green-50 border-green-100 text-green-900',
  amber: 'bg-amber-50 border-amber-100 text-amber-900',
  red: 'bg-red-50 border-red-100 text-red-900',
  gray: 'bg-gray-50 border-gray-100 text-gray-700',
  blue: 'bg-blue-50 border-blue-100 text-blue-900',
  violet: 'bg-violet-50 border-violet-100 text-violet-900',
  teal: 'bg-teal-50 border-teal-100 text-teal-900',
}

const PARKING_TONE: Record<string, Tone> = {
  free: 'green',
  discover_pass: 'violet',
  nw_forest_pass: 'teal',
  national_park_fee: 'blue',
  unknown: 'gray',
}

function alertSuggestsClosure(message: string): boolean {
  return /\b(closed|closure|impassable|not accessible|no access|blocked)\b/i.test(message)
}

function alertIsTrailClosure(alert: NonNullable<Trail['alerts']>[number]): boolean {
  if (alert.source?.toLowerCase() === 'wsdot') return false
  return alert.type === 'closure' || alertSuggestsClosure(alert.message)
}

function alertSuggestsClosureOrSnow(message: string): boolean {
  return /\b(closed|closure|impassable|snow|avalanche|winter)\b/i.test(message)
}

function hasSnowOrClosureRisk(trail: Trail, activeAlerts: NonNullable<Trail['alerts']>): boolean {
  return (
    trail.conditions.snow === 'significant' ||
    activeAlerts.some(alert => alertIsTrailClosure(alert) || alertSuggestsClosureOrSnow(alert.message))
  )
}

function getAccessStatus(trail: Trail, activeAlerts: NonNullable<Trail['alerts']>) {
  const hasClosure = activeAlerts.some(alertIsTrailClosure)

  if (hasClosure) {
    return {
      label: 'Not accessible',
      className: 'text-red-700',
      note: 'A closure or no-access advisory is active. Pick another trail unless you verify it has reopened.',
    }
  }

  if (trail.access.level === 'sedan_ok') {
    return { label: 'Sedan OK', className: 'text-trail-dark', note: null }
  }

  if (trail.access.level === 'unknown') {
    return {
      label: 'Check access before going',
      className: 'text-amber-700',
      note: 'Road access is not confirmed for this trail yet.',
    }
  }

  return {
    label: trail.access.level.replace(/_/g, ' '),
    className: 'text-amber-700',
    note: 'Road access may require more capable tires or clearance.',
  }
}

function getWeatherGlance(trail: Trail): { value: string; tone: Tone } {
  if (trail.conditions.weatherHint) return { value: trail.conditions.weatherHint, tone: 'amber' }
  if (trail.conditions.snow === 'significant') return { value: 'Snow likely', tone: 'amber' }
  if (trail.conditions.snow === 'patchy') return { value: 'Patchy snow', tone: 'amber' }
  if (trail.conditions.overall === 'go') return { value: 'Looks good', tone: 'green' }
  if (trail.conditions.overall === 'avoid') return { value: 'Avoid today', tone: 'red' }
  return { value: 'Check forecast', tone: 'gray' }
}

function getRoadGlance(
  trail: Trail,
  accessStatus: ReturnType<typeof getAccessStatus>,
  hasClosureRisk: boolean
): { value: string; tone: Tone; detail?: string } {
  if (accessStatus.label === 'Not accessible') {
    return { value: 'Closed', tone: 'red', detail: 'Trail-specific closure' }
  }

  if (trail.roadCondition?.condition && trail.roadCondition.condition !== 'unknown') {
    const value = CONDITION_LABEL[trail.roadCondition.condition] ?? trail.roadCondition.condition.replace('_', ' ')
    const caution = trail.roadCondition.condition === 'rough' || trail.roadCondition.condition === 'very_rough'
    return {
      value,
      tone: caution || hasClosureRisk ? 'amber' : 'green',
      detail: trail.roadCondition.surface !== 'unknown'
        ? `${SURFACE_LABEL[trail.roadCondition.surface] ?? trail.roadCondition.surface} road`
        : undefined,
    }
  }

  if (trail.access.level === 'sedan_ok') return { value: 'Sedan OK', tone: 'green' }
  if (trail.access.level === 'unknown') return { value: 'Check access', tone: 'amber' }
  return { value: accessStatus.label, tone: 'amber' }
}

function GlanceTile({
  label,
  value,
  tone,
  detail,
}: {
  label: string
  value: string
  tone: Tone
  detail?: string
}) {
  return (
    <div className={`min-w-0 rounded-xl border px-2 py-2 text-left ${GLANCE_TONE_CLASS[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-[11px] font-bold leading-tight break-words">{value}</p>
      {detail && <p className="mt-1 text-[10px] leading-tight opacity-70 break-words">{detail}</p>}
    </div>
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
  const accessStatus = getAccessStatus(trail, activeAlerts)
  const weatherGlance = getWeatherGlance(trail)
  const roadGlance = getRoadGlance(trail, accessStatus, showAccessConfidenceWarning)
  const parkingLabel = PARKING_LABEL[trail.parking.type] ?? 'Unknown'
  const parkingTone = PARKING_TONE[trail.parking.type] ?? 'gray'
  const statsPending = trail.statsConfidence === 'low'

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
          {activeAlerts.map((alert, i) => {
            const isTrailClosure = alertIsTrailClosure(alert)
            const label = isTrailClosure ? 'closure' : alert.type === 'info' ? 'info' : 'warning'

            return (
              <div key={i} className={`rounded-xl px-3 py-2 text-sm border
                ${isTrailClosure ? 'bg-red-50 border-red-200 text-red-800' :
                  label === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                  'bg-blue-50 border-blue-200 text-blue-800'}`}>
                <strong className="capitalize">{label}:</strong> {alert.message}
                <span className="text-xs opacity-60 ml-1">- {alert.source}</span>
              </div>
            )
          })}
        </div>
      )}

      <Section title="Today at a Glance">
        <div className="grid grid-cols-3 gap-2">
          <GlanceTile label="Weather" value={weatherGlance.value} tone={weatherGlance.tone} />
          <GlanceTile label="Road" value={roadGlance.value} tone={roadGlance.tone} detail={roadGlance.detail} />
          <GlanceTile label="Permit" value={parkingLabel} tone={parkingTone} />
        </div>
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
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium capitalize ${accessStatus.className}`}>
                {accessStatus.label}
              </span>
            {showAccessConfidenceWarning && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Low confidence</span>
            )}
            </div>
            {accessStatus.note && (
              <p className="text-sm text-trail-stone mt-1">{accessStatus.note}</p>
            )}
          </div>
        )}
        {trail.access.notes && !trail.roadCondition && (
          <p className="text-sm text-trail-stone mt-1">{trail.access.notes}</p>
        )}
      </Section>

      <Section title="Parking & Passes">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-sm font-semibold text-trail-dark">
            {parkingLabel}
          </p>
          {trail.parking.notes && (
            <p className="text-sm text-trail-stone mt-1">{trail.parking.notes}</p>
          )}
        </div>
      </Section>

      <Section title="Basics">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(statsPending
            ? [
                { label: 'Route', value: trail.routeType },
                { label: 'Land Owner', value: trail.landOwner },
              ]
            : [
                { label: 'Distance',  value: `${trail.miles} miles` },
                { label: 'Elevation', value: `${trail.elevationGainFt.toLocaleString()} ft gain` },
                { label: 'Difficulty',value: trail.difficulty },
                { label: 'Route',     value: trail.routeType },
                { label: 'Land Owner',value: trail.landOwner },
                ...(trail.trailheadElevationFt ? [{ label: 'TH Elevation', value: `${trail.trailheadElevationFt.toLocaleString()} ft` }] : []),
              ]).map(({ label, value }) => (
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

    </div>
  )
}
