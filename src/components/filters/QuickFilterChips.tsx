import { useTrailStore } from '../../state/useTrailStore'

interface Chip {
  id: string
  icon: string
  label: string
  filterKey: string
  filterValue: string
  activeValue: string
}

const CHIPS: Chip[] = [
  { id: 'go', icon: '🌤️', label: 'Good today', filterKey: 'conditionOverall', filterValue: 'go', activeValue: 'go' },
  { id: 'discover', icon: '🎟️', label: 'Discover Pass', filterKey: 'parkingType', filterValue: 'discover_pass', activeValue: 'discover_pass' },
  { id: 'nw-forest', icon: '🌲', label: 'NW Forest Pass', filterKey: 'parkingType', filterValue: 'nw_forest_pass', activeValue: 'nw_forest_pass' },
  { id: 'free', icon: '🅿️', label: 'Free parking', filterKey: 'parkingType', filterValue: 'free', activeValue: 'free' },
]

export function QuickFilterChips() {
  const { activeFilters, setFilter } = useTrailStore()

  const toggle = (chip: Chip) => {
    const key = chip.filterKey as keyof typeof activeFilters
    const current = activeFilters[key] as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFilter(key as any, current === chip.activeValue ? 'any' : chip.filterValue as any)
  }

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
      {CHIPS.map((chip) => {
        const current = activeFilters[chip.filterKey as keyof typeof activeFilters] as string
        const active = current === chip.activeValue
        return (
          <button
            key={chip.id}
            onClick={() => toggle(chip)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-body font-medium rounded-full px-3 py-1.5 border transition-all duration-150
              ${active
                ? 'bg-trail-green text-white border-trail-green shadow-sm'
                : 'bg-white text-trail-dark border-gray-200 hover:border-trail-green/40'}`}
          >
            <span aria-hidden="true">{chip.icon}</span>
            <span>{chip.label}</span>
          </button>
        )
      })}
    </div>
  )
}
