type WARegion =
  | 'Olympic Peninsula'
  | 'North Cascades'
  | 'Central Cascades'
  | 'Snoqualmie Region'
  | 'South Cascades'
  | 'Eastern Washington'
  | 'Puget Sound & Islands'
  | 'Southwest Washington'

type Difficulty = 'Easy' | 'Moderate' | 'Hard' | 'Strenuous'
type LandOwner = 'DNR' | 'WDFW' | 'StateParks' | 'USFS' | 'NPS' | 'County' | 'City' | 'Other'
type ParkingPassType = 'free' | 'discover_pass' | 'nw_forest_pass' | 'national_park_fee' | 'unknown'
type AccessLevel = 'sedan_ok' | 'rough' | 'high_clearance' | '4x4_only' | 'unknown'

// ─── WA region from lat/lng bounding boxes ────────────────────────────────────

export function regionFromLatLng(lat: number, lng: number): WARegion {
  if (lng < -123.5) return 'Olympic Peninsula'
  if (lat > 48.2)   return 'North Cascades'
  if (lat > 47.8 && lng < -121.0) return 'North Cascades'
  if (lat > 47.2 && lat < 48.2 && lng > -122.0 && lng < -120.5) return 'Central Cascades'
  if (lat > 47.0 && lat < 47.8 && lng > -122.5 && lng < -121.0) return 'Snoqualmie Region'
  if (lat < 47.0 && lng < -121.5) return 'South Cascades'
  if (lng > -118.5) return 'Eastern Washington'
  if (lat > 47.5 && lng > -123.0 && lng < -122.0) return 'Puget Sound & Islands'
  if (lat < 46.5 && lng < -122.0) return 'Southwest Washington'
  return 'Central Cascades'
}

// ─── OSM sac_scale to Difficulty ─────────────────────────────────────────────

export function osmSacScaleToDifficulty(scale: string): Difficulty {
  switch (scale) {
    case 'hiking':                    return 'Easy'
    case 'mountain_hiking':           return 'Moderate'
    case 'demanding_mountain_hiking': return 'Hard'
    case 'alpine_hiking':             return 'Hard'
    case 'demanding_alpine_hiking':   return 'Strenuous'
    case 'difficult_alpine_hiking':   return 'Strenuous'
    default:                          return 'Moderate'
  }
}

// ─── Operator/owner to LandOwner ─────────────────────────────────────────────

export function operatorToLandOwner(operator?: string): LandOwner {
  if (!operator) return 'Other'
  const o = operator.toLowerCase()
  if (/national park|nps/.test(o)) return 'NPS'
  if (/forest service|usfs|national forest/.test(o)) return 'USFS'
  if (/state park|dnr/.test(o)) return 'StateParks'
  if (/dnr|natural resources/.test(o)) return 'DNR'
  if (/fish.*wildlife|wdfw/.test(o)) return 'WDFW'
  if (/county/.test(o)) return 'County'
  if (/city|metro/.test(o)) return 'City'
  return 'Other'
}

// ─── LandOwner to default parking pass ───────────────────────────────────────

export function landOwnerToParking(owner: LandOwner): ParkingPassType {
  switch (owner) {
    case 'NPS':        return 'national_park_fee'
    case 'USFS':       return 'nw_forest_pass'
    case 'StateParks': return 'discover_pass'
    case 'DNR':        return 'discover_pass'
    default:           return 'unknown'
  }
}

// ─── OSM/DNR road surface → AccessLevel ──────────────────────────────────────

export function surfaceToAccessLevel(surface?: string, smoothness?: string, dnrLevel?: number): AccessLevel {
  if (dnrLevel !== undefined) {
    if (dnrLevel <= 1) return 'unknown'
    if (dnrLevel === 2) return 'high_clearance'
    if (dnrLevel === 3) return 'rough'
    return 'sedan_ok'
  }
  if (!surface) return 'unknown'
  const s = surface.toLowerCase()
  const sm = (smoothness ?? '').toLowerCase()
  if (sm === 'horrible' || sm === 'very_bad') return '4x4_only'
  if (/^(paved|asphalt|concrete)$/.test(s)) return 'sedan_ok'
  if (/^(compacted|fine_gravel)$/.test(s)) return sm === 'bad' ? 'high_clearance' : 'rough'
  if (s === 'gravel') return 'rough'
  if (/^(unpaved|dirt|earth|ground|grass)$/.test(s)) return sm === 'bad' ? '4x4_only' : 'high_clearance'
  return 'unknown'
}

// ─── OSM meters to miles ──────────────────────────────────────────────────────

export function metersToMiles(m: number): number {
  return Math.round((m / 1609.34) * 10) / 10
}

// ─── Sanitise a trail name ────────────────────────────────────────────────────

export function cleanName(raw: string): string {
  return raw
    .replace(/\btrail\b/gi, 'Trail')
    .replace(/\s+/g, ' ')
    .trim()
}
