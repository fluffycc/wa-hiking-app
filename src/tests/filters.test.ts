import { describe, it, expect } from 'vitest'
import { filterTrails, DEFAULT_FILTERS } from '../domain/filters'
import type { Trail } from '../domain/types'

const makeTrail = (overrides: Partial<Trail>): Trail => ({
  id: 'test-1', name: 'Test Trail', region: 'Snoqualmie Region',
  lat: 47.5, lng: -121.5, miles: 5, elevationGainFt: 1000,
  difficulty: 'Moderate', routeType: 'OutAndBack', landOwner: 'USFS',
  parking: { type: 'nw_forest_pass', confidence: 'high' },
  access: { level: 'sedan_ok', confidence: 'high' },
  conditions: { overall: 'go', snow: 'none', mud: 'dry', bugs: 'none', notes: [] },
  ...overrides,
})

const trails: Trail[] = [
  makeTrail({ id: '1', conditions: { overall: 'go',      snow: 'none',        mud: 'dry',   bugs: 'none', notes: [] } }),
  makeTrail({ id: '2', conditions: { overall: 'caution', snow: 'patchy',      mud: 'some',  bugs: 'none', notes: [] } }),
  makeTrail({ id: '3', conditions: { overall: 'avoid',   snow: 'significant', mud: 'heavy', bugs: 'bad',  notes: [] } }),
  makeTrail({ id: '4', conditions: { overall: 'unknown', snow: 'none',        mud: 'dry',   bugs: 'none', notes: [] } }),
  makeTrail({ id: '5', difficulty: 'Easy',      access: { level: 'sedan_ok',     confidence: 'high' }, parking: { type: 'free',           confidence: 'high' } }),
  makeTrail({ id: '6', difficulty: 'Strenuous', access: { level: 'high_clearance', confidence: 'high' }, parking: { type: 'discover_pass', confidence: 'high' } }),
  makeTrail({ id: '7', miles: 12, elevationGainFt: 3500 }),
]

describe('filterTrails', () => {
  it('returns all trails with default (empty) filters', () => {
    expect(filterTrails(trails, DEFAULT_FILTERS)).toHaveLength(trails.length)
  })

  it('filters by conditionOverall = go', () => {
    const result = filterTrails(trails, { ...DEFAULT_FILTERS, conditionOverall: 'go' })
    expect(result.every(t => t.conditions.overall === 'go')).toBe(true)
    expect(result.some(t => t.conditions.overall === 'caution')).toBe(false)
  })

  it('filters by accessLevel = sedan_ok', () => {
    const result = filterTrails(trails, { ...DEFAULT_FILTERS, accessLevel: 'sedan_ok' })
    expect(result.every(t => t.access.level === 'sedan_ok')).toBe(true)
  })

  it('filters by parkingType = free', () => {
    const result = filterTrails(trails, { ...DEFAULT_FILTERS, parkingType: 'free' })
    expect(result.every(t => t.parking.type === 'free')).toBe(true)
  })

  it('filters by maxMiles', () => {
    const result = filterTrails(trails, { ...DEFAULT_FILTERS, maxMiles: 6 })
    expect(result.every(t => t.miles <= 6)).toBe(true)
    expect(result.some(t => t.miles > 6)).toBe(false)
  })

  it('filters by difficulty array (OR within group)', () => {
    const result = filterTrails(trails, { ...DEFAULT_FILTERS, difficulty: ['Easy'] })
    expect(result.every(t => t.difficulty === 'Easy')).toBe(true)
  })

  it('empty difficulty array shows all difficulties', () => {
    const result = filterTrails(trails, { ...DEFAULT_FILTERS, difficulty: [] })
    expect(result).toHaveLength(trails.length)
  })

  it('combines multiple filters with AND logic', () => {
    const result = filterTrails(trails, {
      ...DEFAULT_FILTERS,
      conditionOverall: 'go',
      accessLevel: 'sedan_ok',
    })
    expect(result.every(t => t.conditions.overall === 'go' && t.access.level === 'sedan_ok')).toBe(true)
  })
})
