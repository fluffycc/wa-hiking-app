import { normalizeCorrectionName } from './trailCorrections'

type TrailDoc = Record<string, any>

interface PopularTrailFilter {
  query?: string
  north?: number
  south?: number
  east?: number
  west?: number
  region?: string
  parking?: string
  difficulty?: string
  maxMiles?: number
}

const NOW = '2026-05-09T00:00:00.000Z'

function wtaTrail(values: TrailDoc): TrailDoc {
  return {
    routeType: 'OutAndBack',
    landOwner: values.parking?.type === 'discover_pass' ? 'DNR' : values.parking?.type === 'nw_forest_pass' ? 'USFS' : 'Other',
    access: { level: 'sedan_ok', confidence: 'medium' },
    conditions: { overall: 'unknown', snow: 'none', mud: 'dry', bugs: 'none', notes: [] },
    alerts: [],
    source: 'wta',
    syncedAt: NOW,
    ...values,
    pk: values.region,
    wta: {
      name: values.name,
      url: values.wtaUrl,
      syncedAt: NOW,
      statsSyncedAt: NOW,
      status: 'matched',
      statsAvailable: true,
      parkingChecked: true,
      accessChecked: true,
      statsChecked: true,
    },
  }
}

export const POPULAR_WTA_TRAILS: TrailDoc[] = [
  wtaTrail({ id: 'wta-rattlesnake-ledge', name: 'Rattlesnake Ledge', region: 'Snoqualmie Region', lat: 47.4347127863, lng: -121.768745691, miles: 4.0, elevationGainFt: 1160, trailheadElevationFt: 918, difficulty: 'Moderate', parking: { type: 'free', notes: 'WTA: None', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/rattlesnake-ledge' }),
  wtaTrail({ id: 'wta-rattlesnake-trail', name: 'Rattlesnake Trail', region: 'Eastern Washington', lat: 46.2043616519, lng: -117.706650496, miles: 12.0, elevationGainFt: 2700, trailheadElevationFt: 3000, difficulty: 'Hard', parking: { type: 'free', notes: 'WTA: None', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/rattlesnake-trail' }),
  wtaTrail({ id: 'wta-mount-si', name: 'Mount Si', region: 'Snoqualmie Region', lat: 47.4879799075, lng: -121.723121166, miles: 8.0, elevationGainFt: 3150, trailheadElevationFt: 750, difficulty: 'Hard', parking: { type: 'discover_pass', notes: 'WTA: Discover Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/mount-si' }),
  wtaTrail({ id: 'wta-little-si', name: 'Little Si', region: 'Snoqualmie Region', lat: 47.4866523238, lng: -121.753510503, miles: 3.7, elevationGainFt: 1300, trailheadElevationFt: 250, difficulty: 'Moderate', parking: { type: 'discover_pass', notes: 'WTA: Discover Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/little-si' }),
  wtaTrail({ id: 'wta-snow-lake', name: 'Snow Lake', region: 'Snoqualmie Region', lat: 47.4454166667, lng: -121.423016667, miles: 7.2, elevationGainFt: 1800, trailheadElevationFt: 2600, difficulty: 'Hard', parking: { type: 'nw_forest_pass', notes: 'WTA: Northwest Forest Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/snow-lake' }),
  wtaTrail({ id: 'wta-mailbox-peak', name: 'Mailbox Peak', region: 'Snoqualmie Region', lat: 47.4674903, lng: -121.674803, miles: 9.4, elevationGainFt: 4000, trailheadElevationFt: 822, difficulty: 'Hard', parking: { type: 'discover_pass', notes: 'WTA: Discover Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/mailbox-peak' }),
  wtaTrail({ id: 'wta-twin-falls', name: 'Twin Falls', region: 'Snoqualmie Region', lat: 47.4525925602, lng: -121.705405712, miles: 2.4, elevationGainFt: 500, trailheadElevationFt: 500, difficulty: 'Moderate', parking: { type: 'discover_pass', notes: 'WTA: Discover Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/twin-falls-state-park' }),
  wtaTrail({ id: 'wta-poo-poo-point-chirico-trail', name: 'Poo Poo Point - Chirico Trail', region: 'Snoqualmie Region', lat: 47.5000105569, lng: -122.021927834, miles: 3.8, elevationGainFt: 1760, trailheadElevationFt: 90, difficulty: 'Moderate', parking: { type: 'free', notes: 'WTA: None', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/poo-poo-point-chirico-trail' }),
  wtaTrail({ id: 'wta-poo-poo-point', name: 'Poo Poo Point', region: 'Snoqualmie Region', lat: 47.524612752, lng: -122.02611208, miles: 7.2, elevationGainFt: 1748, trailheadElevationFt: 273, difficulty: 'Hard', parking: { type: 'free', notes: 'WTA: None', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/poo-poo-point' }),
  wtaTrail({ id: 'wta-lake-serene', name: 'Lake Serene', region: 'North Cascades', lat: 47.809046067, lng: -121.573797763, miles: 8.2, elevationGainFt: 2000, trailheadElevationFt: 521, difficulty: 'Hard', parking: { type: 'nw_forest_pass', notes: 'WTA: Northwest Forest Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/lake-serene' }),
  wtaTrail({ id: 'wta-wallace-falls-state-park', name: 'Wallace Falls State Park', region: 'North Cascades', lat: 47.8669166667, lng: -121.67805, miles: 5.6, elevationGainFt: 1300, trailheadElevationFt: 200, difficulty: 'Moderate', parking: { type: 'discover_pass', notes: 'WTA: Discover Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/wallace-falls' }),
  wtaTrail({ id: 'wta-mount-pilchuck', name: 'Mount Pilchuck', region: 'North Cascades', lat: 48.0702095372, lng: -121.814682931, miles: 5.4, elevationGainFt: 2300, trailheadElevationFt: 3027, difficulty: 'Hard', parking: { type: 'nw_forest_pass', notes: 'WTA: Northwest Forest Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/mount-pilchuck' }),
  wtaTrail({ id: 'wta-colchuck-lake', name: 'Colchuck Lake', region: 'Central Cascades', lat: 47.5277, lng: -120.820983333, miles: 8.0, elevationGainFt: 2280, trailheadElevationFt: 3300, difficulty: 'Hard', parking: { type: 'nw_forest_pass', notes: 'WTA: Northwest Forest Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/colchuck-lake' }),
  wtaTrail({ id: 'wta-ira-spring-trail-mason-lake', name: 'Ira Spring Trail - Mason Lake', region: 'Snoqualmie Region', lat: 47.4257166667, lng: -121.584283333, miles: 7.0, elevationGainFt: 2420, trailheadElevationFt: 1900, difficulty: 'Hard', parking: { type: 'nw_forest_pass', notes: 'WTA: Northwest Forest Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/ira-spring-memorial' }),
  wtaTrail({ id: 'wta-franklin-falls', name: 'Franklin Falls', region: 'Snoqualmie Region', lat: 47.4131077959, lng: -121.44276917, miles: 2.0, elevationGainFt: 400, trailheadElevationFt: 2200, difficulty: 'Easy', parking: { type: 'nw_forest_pass', notes: 'WTA: Northwest Forest Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/franklin-falls' }),
  wtaTrail({ id: 'wta-oyster-dome', name: 'Oyster Dome', region: 'North Cascades', lat: 48.6096353573, lng: -122.426351309, miles: 5.0, elevationGainFt: 1050, trailheadElevationFt: 975, difficulty: 'Moderate', parking: { type: 'discover_pass', notes: 'WTA: Discover Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/oyster-dome' }),
  wtaTrail({ id: 'wta-bridal-veil-falls', name: 'Bridal Veil Falls', region: 'North Cascades', lat: 47.8091924291, lng: -121.573974788, miles: 4.0, elevationGainFt: 1000, trailheadElevationFt: 600, difficulty: 'Moderate', parking: { type: 'nw_forest_pass', notes: 'WTA: Northwest Forest Pass', confidence: 'high' }, wtaUrl: 'https://www.wta.org/go-hiking/hikes/bridal-veil-falls' }),
]

function matchesQuery(trail: TrailDoc, query?: string): boolean {
  if (!query?.trim()) return true
  const q = normalizeCorrectionName(query)
  const name = normalizeCorrectionName(trail.name)
  return name.includes(q) || q.includes(name)
}

function matchesBounds(trail: TrailDoc, filter: PopularTrailFilter): boolean {
  if (
    typeof filter.north !== 'number' ||
    typeof filter.south !== 'number' ||
    typeof filter.east !== 'number' ||
    typeof filter.west !== 'number'
  ) {
    return true
  }

  return trail.lat >= filter.south && trail.lat <= filter.north && trail.lng >= filter.west && trail.lng <= filter.east
}

export function getPopularTrailCandidates(filter: PopularTrailFilter): TrailDoc[] {
  const hasSpatialOrSearch = !!filter.query?.trim() || (
    typeof filter.north === 'number' &&
    typeof filter.south === 'number' &&
    typeof filter.east === 'number' &&
    typeof filter.west === 'number'
  )
  if (!hasSpatialOrSearch) return []

  const regions = filter.region?.split(',').map(region => region.trim()).filter(Boolean)
  const difficulties = filter.difficulty?.split(',').map(difficulty => difficulty.trim()).filter(Boolean)

  return POPULAR_WTA_TRAILS.filter(trail => {
    if (!matchesQuery(trail, filter.query)) return false
    if (!matchesBounds(trail, filter)) return false
    if (regions?.length && !regions.includes(trail.region)) return false
    if (filter.parking && filter.parking !== 'any' && trail.parking?.type !== filter.parking) return false
    if (difficulties?.length && !difficulties.includes(trail.difficulty)) return false
    if (typeof filter.maxMiles === 'number' && trail.miles > filter.maxMiles) return false
    return true
  })
}
