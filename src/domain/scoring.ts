import type { Trail, ConditionOverall } from './types'

const CONDITION_SCORE: Record<ConditionOverall, number> = {
  go:      3,
  caution: 2,
  unknown: 1,
  avoid:   0,
}

export function conditionScore(overall: ConditionOverall): number {
  return CONDITION_SCORE[overall]
}

export function trailGoScore(trail: Trail): number {
  let score = conditionScore(trail.conditions.overall) * 10
  if (trail.conditions.snow === 'none') score += 2
  if (trail.conditions.snow === 'patchy') score += 1
  if (trail.conditions.mud === 'dry') score += 2
  if (trail.conditions.mud === 'some') score += 1
  if (trail.conditions.bugs === 'none') score += 1
  return score
}

export function isGoToday(trail: Trail): boolean {
  return trail.conditions.overall === 'go'
}
