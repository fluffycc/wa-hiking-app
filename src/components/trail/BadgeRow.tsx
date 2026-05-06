import type { Trail } from '../../domain/types'

const CONDITION_LABEL: Record<string, string> = {
  go: '🟢 Go', caution: '🟡 Caution', avoid: '🔴 Avoid', unknown: '⚪ Unknown',
}
const CONDITION_CLASS: Record<string, string> = {
  go: 'bg-green-100 text-green-800 border-green-200',
  caution: 'bg-amber-100 text-amber-800 border-amber-200',
  avoid: 'bg-red-100 text-red-800 border-red-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
}
const ACCESS_LABEL: Record<string, string> = {
  sedan_ok: '🚗 Sedan', rough: '🛞 Rough', high_clearance: '🚙 High Clr',
  '4x4_only': '🚜 4x4', unknown: '❓ Access',
}
const ACCESS_CLASS: Record<string, string> = {
  sedan_ok: 'bg-blue-100 text-blue-800 border-blue-200',
  rough: 'bg-orange-100 text-orange-800 border-orange-200',
  high_clearance: 'bg-orange-100 text-orange-800 border-orange-200',
  '4x4_only': 'bg-red-100 text-red-800 border-red-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
}
const PARKING_LABEL: Record<string, string> = {
  free: '🆓 Free', discover_pass: '🏷 Discover', nw_forest_pass: '🌲 NW Forest',
  national_park_fee: '🏔 NPS Fee', unknown: '❓ Parking',
}
const PARKING_CLASS: Record<string, string> = {
  free: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  discover_pass: 'bg-violet-100 text-violet-800 border-violet-200',
  nw_forest_pass: 'bg-teal-100 text-teal-800 border-teal-200',
  national_park_fee: 'bg-sky-100 text-sky-800 border-sky-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
}

interface Props { trail: Trail; size?: 'sm' | 'md' }

export function BadgeRow({ trail, size = 'md' }: Props) {
  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
  const badge = (label: string, cls: string) => (
    <span className={`inline-flex items-center rounded-full border font-body font-medium ${px} ${cls}`}>
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap gap-1.5">
      {badge(CONDITION_LABEL[trail.conditions.overall] ?? '?', CONDITION_CLASS[trail.conditions.overall] ?? '')}
      {badge(ACCESS_LABEL[trail.access.level] ?? '?', ACCESS_CLASS[trail.access.level] ?? '')}
      {badge(PARKING_LABEL[trail.parking.type] ?? '?', PARKING_CLASS[trail.parking.type] ?? '')}
    </div>
  )
}
