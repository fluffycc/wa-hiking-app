import { useTrailStore } from '../../state/useTrailStore'

interface Chip {
  label: string
  filterKey: string
  filterValue: string
  activeValue: string
}

const CHIPS: Chip[] = [
  { label: '🟢 Go Today',     filterKey: 'conditionOverall', filterValue: 'go',        activeValue: 'go' },
  { label: '🚗 Sedan OK',     filterKey: 'accessLevel',      filterValue: 'sedan_ok',  activeValue: 'sedan_ok' },
  { label: '🆓 Free Parking', filterKey: 'parkingType',      filterValue: 'free',      activeValue: 'free' },
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
            key={chip.filterKey}
            onClick={() => toggle(chip)}
            className={`flex-shrink-0 text-xs font-body font-medium rounded-full px-3 py-1.5 border transition-all duration-150
              ${active
                ? 'bg-trail-green text-white border-trail-green shadow-sm'
                : 'bg-white text-trail-dark border-gray-200 hover:border-trail-green/40'}`}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}
