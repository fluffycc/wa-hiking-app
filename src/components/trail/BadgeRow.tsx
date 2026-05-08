import type { Trail } from '../../domain/types'

const BADGE_CLASS = {
  green: 'bg-green-100 text-green-800 border-green-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  red: 'bg-red-100 text-red-800 border-red-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200',
  teal: 'bg-teal-100 text-teal-800 border-teal-200',
  sky: 'bg-sky-100 text-sky-800 border-sky-200',
}

const PARKING_LABEL: Record<string, string> = {
  free: 'Free parking',
  discover_pass: 'Discover Pass',
  nw_forest_pass: 'NW Forest Pass',
  national_park_fee: 'Park fee',
  unknown: 'Parking unknown',
}

const PARKING_CLASS: Record<string, string> = {
  free: BADGE_CLASS.emerald,
  discover_pass: BADGE_CLASS.violet,
  nw_forest_pass: BADGE_CLASS.teal,
  national_park_fee: BADGE_CLASS.sky,
  unknown: BADGE_CLASS.gray,
}

interface Props {
  trail: Trail
  size?: 'sm' | 'md'
}

function alertIsActive(alert: NonNullable<Trail['alerts']>[number]): boolean {
  return !alert.expiresISO || new Date(alert.expiresISO) > new Date()
}

function textSuggestsClosure(value?: string): boolean {
  return !!value && /\b(closed|closure|impassable|not accessible|no access|blocked)\b/i.test(value)
}

function alertIsTrailClosure(alert: NonNullable<Trail['alerts']>[number]): boolean {
  if (alert.source?.toLowerCase() === 'wsdot') return false
  return alert.type === 'closure' || textSuggestsClosure(alert.message)
}

function textSuggestsRoadCaution(value?: string): boolean {
  return !!value && /\b(rough|pothole|rutted|washout|washed out|high clearance|4x4|chains|advisory|closed|closure|no access)\b/i.test(value)
}

function hasClosure(trail: Trail): boolean {
  const activeAlerts = trail.alerts?.filter(alertIsActive) ?? []

  return (
    activeAlerts.some(alertIsTrailClosure) ||
    trail.conditions.notes.some(textSuggestsClosure)
  )
}

function hasRoadCaution(trail: Trail): boolean {
  const activeAlerts = trail.alerts?.filter(alertIsActive) ?? []
  const roadCondition = trail.roadCondition?.condition

  return (
    ['rough', 'high_clearance', '4x4_only'].includes(trail.access.level) ||
    roadCondition === 'rough' ||
    roadCondition === 'very_rough' ||
    textSuggestsRoadCaution(trail.access.notes) ||
    textSuggestsRoadCaution(trail.roadCondition?.notes) ||
    activeAlerts.some(alert => alert.type === 'warning' || textSuggestsRoadCaution(alert.message))
  )
}

function getConditionBadge(trail: Trail): { label: string; className: string } {
  if (hasClosure(trail)) return { label: 'Closed', className: BADGE_CLASS.red }
  if (trail.conditions.overall === 'go') return { label: 'Good', className: BADGE_CLASS.green }
  if (trail.conditions.overall === 'unknown') return { label: 'Conditions unknown', className: BADGE_CLASS.gray }
  return { label: 'Caution', className: BADGE_CLASS.amber }
}

function getAccessBadge(trail: Trail): { label: string; className: string } {
  if (hasClosure(trail)) return { label: 'Not accessible', className: BADGE_CLASS.red }
  if (hasRoadCaution(trail)) {
    if (trail.access.level === 'high_clearance') return { label: 'High clearance', className: BADGE_CLASS.amber }
    if (trail.access.level === '4x4_only') return { label: '4x4 road', className: BADGE_CLASS.amber }
    return { label: 'Road caution', className: BADGE_CLASS.amber }
  }
  if (trail.access.level === 'sedan_ok') return { label: 'Sedan OK', className: BADGE_CLASS.blue }
  if (trail.access.level === 'unknown') return { label: 'Check access', className: BADGE_CLASS.amber }
  return { label: trail.access.level.replace(/_/g, ' '), className: BADGE_CLASS.amber }
}

export function BadgeRow({ trail, size = 'md' }: Props) {
  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
  const condition = getConditionBadge(trail)
  const access = getAccessBadge(trail)
  const parkingClass = PARKING_CLASS[trail.parking.type] ?? BADGE_CLASS.gray
  const parkingLabel = PARKING_LABEL[trail.parking.type] ?? 'Parking unknown'

  const badge = (label: string, cls: string) => (
    <span className={`inline-flex items-center rounded-full border font-body font-medium ${px} ${cls}`}>
      {label}
    </span>
  )

  return (
    <div className="flex flex-wrap gap-1.5">
      {badge(condition.label, condition.className)}
      {badge(access.label, access.className)}
      {badge(parkingLabel, parkingClass)}
    </div>
  )
}
