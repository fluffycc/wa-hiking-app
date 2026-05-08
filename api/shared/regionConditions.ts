import { deriveConditions, NOAAForecastPeriod } from './conditionsEngine'

export const REGION_CONDITION_DOC_TYPE = 'regionCondition'
export const REGION_CONDITION_PK = 'system'

const REGION_CONDITION_CACHE_TTL_MS = 10 * 60 * 1000

interface RegionSample {
  lat: number
  lng: number
  elevFt: number
}

export interface RegionConditionDoc {
  id: string
  pk: string
  docType: typeof REGION_CONDITION_DOC_TYPE
  region: string
  sample: RegionSample
  periods: NOAAForecastPeriod[]
  wsdotAlertCount: number
  updatedAtISO: string
}

let regionConditionCache: { cachedAt: number; byRegion: Map<string, RegionConditionDoc> } | null = null

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function regionConditionId(region: string): string {
  return `region-condition-${slug(region)}`
}

export function clearRegionConditionCache(): void {
  regionConditionCache = null
}

export async function upsertRegionCondition(
  container: any,
  region: string,
  sample: RegionSample,
  periods: NOAAForecastPeriod[],
  wsdotAlertCount: number,
): Promise<void> {
  await container.items.upsert({
    id: regionConditionId(region),
    pk: REGION_CONDITION_PK,
    docType: REGION_CONDITION_DOC_TYPE,
    region,
    sample,
    periods,
    wsdotAlertCount,
    updatedAtISO: new Date().toISOString(),
  })
  clearRegionConditionCache()
}

export async function fetchRegionConditionMap(container: any): Promise<Map<string, RegionConditionDoc>> {
  if (regionConditionCache && Date.now() - regionConditionCache.cachedAt < REGION_CONDITION_CACHE_TTL_MS) {
    return regionConditionCache.byRegion
  }

  const { resources } = await container.items.query(
    {
      query: 'SELECT * FROM t WHERE t.docType = @docType',
      parameters: [{ name: '@docType', value: REGION_CONDITION_DOC_TYPE }],
    },
    { enableCrossPartitionQuery: true },
  ).fetchAll()

  const byRegion = new Map<string, RegionConditionDoc>()
  for (const doc of (resources ?? []) as RegionConditionDoc[]) {
    if (doc.region && Array.isArray(doc.periods) && doc.periods.length) {
      byRegion.set(doc.region, doc)
    }
  }

  regionConditionCache = { cachedAt: Date.now(), byRegion }
  return byRegion
}

export function applyRegionConditionToTrail(trail: any, condition?: RegionConditionDoc): any {
  const alerts = Array.isArray(trail.alerts)
    ? trail.alerts.filter((alert: any) => String(alert?.source ?? '').toLowerCase() !== 'wsdot')
    : trail.alerts

  if (!condition?.periods?.length) return { ...trail, alerts }

  const trailheadElev = Number(trail.trailheadElevationFt ?? condition.sample?.elevFt ?? 1500)
  const summitElev = trailheadElev + Number(trail.elevationGainFt ?? 0)
  const derived = deriveConditions(condition.periods, trailheadElev, summitElev, condition.sample?.elevFt)
  const trailSnowSource = String(trail.conditions?.source ?? '').toLowerCase()
  const trailSnowIsRecentWta =
    trailSnowSource === 'wta_trip_report' &&
    trail.conditions?.lastUpdatedISO &&
    Date.now() - new Date(trail.conditions.lastUpdatedISO).getTime() < 14 * 24 * 60 * 60 * 1000
  const snow = trailSnowIsRecentWta ? trail.conditions.snow : derived.snow
  const mud = trailSnowIsRecentWta ? trail.conditions.mud : derived.mud
  const notes = [
    ...(trailSnowIsRecentWta ? trail.conditions.notes ?? [] : []),
    ...derived.notes.filter(note => !(trailSnowIsRecentWta && /snow/i.test(note))),
  ]
  const overall = snow === 'significant' || snow === 'patchy' || mud === 'heavy'
    ? 'caution'
    : derived.overall

  return {
    ...trail,
    alerts,
    conditions: {
      ...(trail.conditions ?? {}),
      overall,
      snow,
      mud,
      bugs: derived.bugs,
      weatherHint: derived.weatherHint,
      notes,
      lastUpdatedISO: condition.updatedAtISO ?? derived.lastUpdatedISO,
    },
  }
}

export async function overlayRegionConditions(container: any, trails: any[]): Promise<any[]> {
  if (!trails.length) return trails

  const byRegion = await fetchRegionConditionMap(container)
  if (!byRegion.size) return trails

  return trails.map(trail => applyRegionConditionToTrail(trail, byRegion.get(String(trail.region ?? ''))))
}
