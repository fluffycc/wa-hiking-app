import { describe, it, expect } from 'vitest'
import { conditionScore, trailGoScore } from '../domain/scoring'
import type { Trail } from '../domain/types'

const makeTrail = (overrides: Partial<Trail['conditions']>): Trail => ({
  id: 'x', name: 'X', region: 'Snoqualmie Region',
  lat: 47, lng: -121, miles: 5, elevationGainFt: 1000,
  difficulty: 'Moderate', routeType: 'OutAndBack', landOwner: 'USFS',
  parking: { type: 'free', confidence: 'high' },
  access: { level: 'sedan_ok', confidence: 'high' },
  conditions: { overall: 'go', snow: 'none', mud: 'dry', bugs: 'none', notes: [], ...overrides },
})

describe('conditionScore', () => {
  it('go scores highest', () => expect(conditionScore('go')).toBeGreaterThan(conditionScore('caution')))
  it('caution scores higher than unknown', () => expect(conditionScore('caution')).toBeGreaterThan(conditionScore('unknown')))
  it('unknown scores higher than avoid', () => expect(conditionScore('unknown')).toBeGreaterThan(conditionScore('avoid')))
  it('avoid scores lowest (0)', () => expect(conditionScore('avoid')).toBe(0))
})

describe('trailGoScore', () => {
  it('go trail with best conditions scores highest', () => {
    const best = trailGoScore(makeTrail({ overall: 'go', snow: 'none', mud: 'dry', bugs: 'none' }))
    const worst = trailGoScore(makeTrail({ overall: 'avoid', snow: 'significant', mud: 'heavy', bugs: 'bad' }))
    expect(best).toBeGreaterThan(worst)
  })
  it('snow/mud/bugs degrade score', () => {
    const clean = trailGoScore(makeTrail({ overall: 'go', snow: 'none', mud: 'dry', bugs: 'none' }))
    const muddy = trailGoScore(makeTrail({ overall: 'go', snow: 'none', mud: 'heavy', bugs: 'bad' }))
    expect(clean).toBeGreaterThan(muddy)
  })
})
