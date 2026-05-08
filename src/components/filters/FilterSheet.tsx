import { useState } from 'react'
import { useTrailStore } from '../../state/useTrailStore'
import { countActiveFilters } from '../../domain/filters'
import type { Difficulty, RouteType } from '../../domain/types'

interface Props {
  open: boolean
  onClose: () => void
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Moderate', 'Hard', 'Strenuous']
const ROUTE_TYPES: RouteType[] = ['Loop', 'OutAndBack', 'PointToPoint']

function Toggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`text-sm rounded-full px-3 py-1.5 border font-body font-medium transition-all
        ${active ? 'bg-trail-green text-white border-trail-green' : 'bg-white text-trail-dark border-gray-200'}`}
    >
      {label}
    </button>
  )
}

export function FilterSheet({ open, onClose }: Props) {
  const { activeFilters, setFilter, clearFilters } = useTrailStore()
  const count = countActiveFilters(activeFilters)
  const [maxMilesInput, setMaxMilesInput] = useState('')

  if (!open) return null

  const toggleArr = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-trail-bg rounded-t-3xl shadow-sheet max-h-[85vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-4 border-b border-gray-100">
          <h3 className="font-display font-bold text-trail-dark text-lg">Filters</h3>
          <div className="flex gap-3 items-center">
            {count > 0 && (
              <button onClick={clearFilters} className="text-sm text-trail-stone underline font-body">
                Clear all ({count})
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
              ✕
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-6">
          {/* Condition */}
          <div>
            <p className="font-display font-semibold text-sm text-trail-dark mb-2">Go Today</p>
            <div className="flex gap-2 flex-wrap">
              {(['go', 'caution', 'avoid', 'any'] as const).map(v => (
                <Toggle key={v} label={v === 'any' ? 'Any condition' : v.charAt(0).toUpperCase() + v.slice(1)}
                  active={activeFilters.conditionOverall === v}
                  onToggle={() => setFilter('conditionOverall', v)} />
              ))}
            </div>
          </div>

          {/* Parking */}
          <div>
            <p className="font-display font-semibold text-sm text-trail-dark mb-2">Costs / Passes</p>
            <div className="flex gap-2 flex-wrap">
              {(['free', 'discover_pass', 'nw_forest_pass', 'national_park_fee', 'any'] as const).map(v => (
                <Toggle
                  key={v}
                  label={v === 'any'
                    ? 'Any pass'
                    : v === 'discover_pass'
                    ? 'Discover Pass'
                    : v === 'nw_forest_pass'
                    ? 'NW Forest Pass'
                    : v === 'national_park_fee'
                    ? 'National park fee'
                    : 'Free parking'}
                  active={activeFilters.parkingType === v}
                  onToggle={() => setFilter('parkingType', v)} />
              ))}
            </div>
          </div>

          {/* Effort */}
          <div>
            <p className="font-display font-semibold text-sm text-trail-dark mb-2">Effort</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {DIFFICULTIES.map(d => (
                <Toggle key={d} label={d}
                  active={activeFilters.difficulty.includes(d)}
                  onToggle={() => setFilter('difficulty', toggleArr(activeFilters.difficulty, d))} />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-trail-stone font-body w-24 shrink-0">Max miles</label>
              <input type="number" min="0" max="50" value={maxMilesInput}
                onChange={e => {
                  setMaxMilesInput(e.target.value)
                  setFilter('maxMiles', e.target.value ? Number(e.target.value) : null)
                }}
                placeholder="No limit"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-28 font-body focus:outline-none focus:ring-2 focus:ring-trail-green/30" />
              {activeFilters.maxMiles !== null && (
                <button onClick={() => { setFilter('maxMiles', null); setMaxMilesInput('') }}
                  className="text-xs text-trail-stone underline">Clear</button>
              )}
            </div>
          </div>

          {/* Route type */}
          <div>
            <p className="font-display font-semibold text-sm text-trail-dark mb-2">Preferences</p>
            <div className="flex gap-2 flex-wrap">
              {ROUTE_TYPES.map(r => (
                <Toggle key={r} label={r}
                  active={activeFilters.routeType.includes(r)}
                  onToggle={() => setFilter('routeType', toggleArr(activeFilters.routeType, r))} />
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 pb-8 pt-2">
          <button onClick={onClose}
            className="w-full bg-trail-green text-white font-display font-semibold rounded-2xl py-3.5 hover:bg-trail-dark transition-colors">
            Show Results
          </button>
        </div>
      </div>
    </div>
  )
}
