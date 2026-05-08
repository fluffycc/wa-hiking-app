type TrailDoc = Record<string, any>

interface TrailCorrection {
  aliases: string[]
  maxDistanceDeg?: number
  values: TrailDoc
}

const NOW = '2026-05-08T00:00:00.000Z'

const CORRECTIONS: TrailCorrection[] = [
  {
    aliases: ['lake 22', 'lake 22 trail', 'lake twenty two', 'lake twenty two trail'],
    maxDistanceDeg: 0.6,
    values: {
      name: 'Lake 22',
      region: 'North Cascades',
      lat: 48.0769666667,
      lng: -121.7457,
      miles: 5.4,
      elevationGainFt: 1350,
      trailheadElevationFt: 1050,
      difficulty: 'Moderate',
      routeType: 'OutAndBack',
      landOwner: 'USFS',
      parking: {
        type: 'nw_forest_pass',
        notes: 'WTA: Northwest Forest Pass',
        confidence: 'high',
      },
      source: 'wta',
      wta: {
        name: 'Lake 22',
        url: 'https://www.wta.org/go-hiking/hikes/lake-22-lake-twenty-two',
        syncedAt: NOW,
        statsSyncedAt: NOW,
        status: 'matched',
        parkingChecked: true,
        accessChecked: true,
        statsChecked: true,
      },
    },
  },
  {
    aliases: ['heather lake', 'heather lake trail'],
    maxDistanceDeg: 0.6,
    values: {
      name: 'Heather Lake',
      region: 'North Cascades',
      lat: 48.0828833333,
      lng: -121.774033333,
      miles: 5.0,
      elevationGainFt: 1034,
      trailheadElevationFt: 1396,
      difficulty: 'Moderate',
      routeType: 'OutAndBack',
      landOwner: 'USFS',
      parking: {
        type: 'nw_forest_pass',
        notes: 'WTA: Northwest Forest Pass',
        confidence: 'high',
      },
      source: 'wta',
      wta: {
        name: 'Heather Lake',
        url: 'https://www.wta.org/go-hiking/hikes/heather-lake-1',
        syncedAt: NOW,
        statsSyncedAt: NOW,
        status: 'matched',
        parkingChecked: true,
        accessChecked: true,
        statsChecked: true,
      },
    },
  },
]

export function normalizeCorrectionName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)/g, '')
    .replace(/\btwenty two\b/g, '22')
    .replace(/\btwenty[-\s]?two\b/g, '22')
    .replace(/\btrail\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function withinCorrectionArea(trail: TrailDoc, correction: TrailCorrection): boolean {
  if (!correction.maxDistanceDeg) return true
  if (typeof trail.lat !== 'number' || typeof trail.lng !== 'number') return true

  const lat = correction.values.lat
  const lng = correction.values.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return true

  return Math.abs(trail.lat - lat) <= correction.maxDistanceDeg &&
    Math.abs(trail.lng - lng) <= correction.maxDistanceDeg
}

function findCorrection(trail: TrailDoc): TrailCorrection | undefined {
  const name = normalizeCorrectionName(trail.name)
  return CORRECTIONS.find(correction =>
    correction.aliases.some(alias => normalizeCorrectionName(alias) === name) &&
    withinCorrectionArea(trail, correction)
  )
}

export function applyTrailCorrection(trail: TrailDoc): TrailDoc {
  const correction = findCorrection(trail)
  if (!correction) return trail

  return {
    ...trail,
    ...correction.values,
    id: trail.id,
    pk: trail.pk ?? correction.values.region,
    access: {
      ...(trail.access ?? {}),
      level: trail.access?.level ?? correction.values.access?.level ?? 'unknown',
      confidence: trail.access?.confidence ?? 'medium',
    },
    conditions: trail.conditions ?? {
      overall: 'unknown',
      snow: 'none',
      mud: 'dry',
      bugs: 'none',
      notes: [],
    },
    alerts: trail.alerts ?? [],
    description: trail.description ?? correction.values.description,
    correctedFrom: trail.source ?? 'unknown',
  }
}

export function applyTrailCorrections(trails: TrailDoc[]): TrailDoc[] {
  return trails.map(applyTrailCorrection)
}
