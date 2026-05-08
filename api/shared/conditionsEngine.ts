/**
 * Derives trail conditions from NOAA forecast data.
 * Pure logic — no AI, no paid APIs.
 */

export interface NOAAForecastPeriod {
  name: string
  temperature: number
  temperatureUnit: string
  shortForecast: string
  detailedForecast: string
  windSpeed: string
}

export interface DerivedConditions {
  overall:     'go' | 'caution' | 'avoid' | 'unknown'
  snow:        'none' | 'patchy' | 'significant'
  mud:         'dry' | 'some' | 'heavy'
  bugs:        'none' | 'some' | 'bad'
  weatherHint: string
  notes:       string[]
  lastUpdatedISO: string
}

/**
 * Estimate freezing level altitude in feet from surface conditions.
 * Rough rule of thumb: freezing level drops ~3.5°F per 1000ft gain.
 */
function estimateFreezingLevelFt(surfaceTempF: number): number {
  if (surfaceTempF <= 32) return 0
  return ((surfaceTempF - 32) / 3.5) * 1000
}

function trailIsWellBelowForecastSample(
  summitElevFt: number,
  forecastSampleElevFt?: number,
): boolean {
  return typeof forecastSampleElevFt === 'number' && forecastSampleElevFt - summitElevFt >= 750
}

export function deriveConditions(
  periods: NOAAForecastPeriod[],
  trailheadElevFt: number,
  summitElevFt: number,
  forecastSampleElevFt?: number,
): DerivedConditions {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  const notes: string[] = []

  // Use next 3 forecast periods (48h)
  const near = periods.slice(0, 3)
  const minTempF = Math.min(...near.map(p =>
    p.temperatureUnit === 'F' ? p.temperature : (p.temperature * 9 / 5) + 32
  ))
  const maxTempF = Math.max(...near.map(p =>
    p.temperatureUnit === 'F' ? p.temperature : (p.temperature * 9 / 5) + 32
  ))

  const forecastText = near.map(p => p.shortForecast.toLowerCase()).join(' ')
  const hasSnow   = /snow|blizzard|flurr/.test(forecastText)
  const hasRain   = /rain|shower|drizzle|thunder/.test(forecastText)
  const hasSun    = /sunny|clear|mostly clear/.test(forecastText)

  // ── Snow ─────────────────────────────────────────────────────────────────
  const freezingLevelFt = estimateFreezingLevelFt(minTempF)
  const belowRegionalSnowBand = trailIsWellBelowForecastSample(summitElevFt, forecastSampleElevFt)
  const snowLevelNearTrail = freezingLevelFt <= summitElevFt + 750
  let snow: DerivedConditions['snow'] = 'none'
  if (hasSnow && !belowRegionalSnowBand && snowLevelNearTrail && summitElevFt >= 3000) {
    snow = 'significant'
    notes.push('Bring microspikes or snowshoes')
  } else if (
    (hasSnow && snowLevelNearTrail && summitElevFt >= 2500) ||
    (!hasSnow && month <= 5 && summitElevFt > 5000)
  ) {
    snow = 'patchy'
    notes.push('Snow possible above mid-elevation')
  }

  // ── Mud ──────────────────────────────────────────────────────────────────
  let mud: DerivedConditions['mud'] = 'dry'
  if (hasRain && hasSnow) {
    mud = 'heavy'
    notes.push('Heavy mud likely on lower trail')
  } else if (hasRain || (month >= 3 && month <= 5 && trailheadElevFt < 3000)) {
    mud = 'some'
  }

  // ── Bugs ─────────────────────────────────────────────────────────────────
  let bugs: DerivedConditions['bugs'] = 'none'
  if (month >= 6 && month <= 8 && trailheadElevFt < 4000) {
    bugs = maxTempF > 75 ? 'bad' : 'some'
    if (bugs === 'bad') notes.push('Bring insect repellent')
  } else if (month === 5 || month === 9) {
    bugs = 'some'
  }

  // ── Overall ───────────────────────────────────────────────────────────────
  let overall: DerivedConditions['overall']
  if (snow === 'significant' || snow === 'patchy' || mud === 'heavy') {
    overall = 'caution'
  } else {
    overall = 'go'
  }

  // ── Weather hint ─────────────────────────────────────────────────────────
  const weatherHint = hasSun
    ? `Clear skies, high ${maxTempF}°F`
    : hasSnow
    ? `Snow expected, low ${minTempF}°F`
    : hasRain
    ? `Rain in forecast, high ${maxTempF}°F`
    : `High ${maxTempF}°F`

  return { overall, snow, mud, bugs, weatherHint, notes, lastUpdatedISO: now.toISOString() }
}

/**
 * Map WA DNR forest road maintenance level to AccessLevel.
 * DNR levels: 1=closed, 2=high-clearance, 3=passenger(gravel), 4=passenger(paved), 5=paved highway
 */
export function dnrMaintenanceLevelToAccess(level: number): string {
  if (level <= 1) return 'unknown'
  if (level === 2) return 'high_clearance'
  if (level === 3) return 'rough'
  return 'sedan_ok'
}

/**
 * Map OSM road surface tag to AccessLevel.
 */
export function osmSurfaceToAccess(surface: string, smoothness?: string): string {
  const s = surface.toLowerCase()
  const sm = (smoothness ?? '').toLowerCase()

  if (sm === 'horrible' || sm === 'very_bad') return '4x4_only'
  if (s === 'paved' || s === 'asphalt' || s === 'concrete') return 'sedan_ok'
  if (s === 'compacted' || s === 'fine_gravel') return sm === 'bad' ? 'high_clearance' : 'rough'
  if (s === 'gravel') return 'rough'
  if (s === 'unpaved' || s === 'dirt' || s === 'earth' || s === 'ground') {
    return sm === 'bad' ? '4x4_only' : 'high_clearance'
  }
  return 'unknown'
}
