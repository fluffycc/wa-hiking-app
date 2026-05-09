import { cleanName, regionFromLatLng } from './trailMapper'
import { normalizeCorrectionName } from './trailCorrections'

type TrailDoc = Record<string, any>
type Difficulty = 'Easy' | 'Moderate' | 'Hard' | 'Strenuous'
type RouteType = 'Loop' | 'OutAndBack' | 'PointToPoint'
type ParkingPassType = 'free' | 'discover_pass' | 'nw_forest_pass' | 'national_park_fee' | 'unknown'

const WTA_SEARCH_URL = 'https://www.wta.org/go-outside/hikes/hike_search'
const WTA_HIKE_URL = 'https://www.wta.org/go-hiking/hikes'
const FETCH_TIMEOUT_MS = 3_500
const USER_AGENT = 'WAHikingApp/1.0 (contact: you@example.com)'
const textCache = new Map<string, string>()

interface WtaMatch {
  url: string
  name: string
}

interface WtaStats {
  url: string
  name: string
  lat?: number
  lng?: number
  miles?: number
  elevationGainFt?: number
  trailheadElevationFt?: number
  difficulty?: Difficulty
  routeType?: RouteType
  parkingType?: ParkingPassType
  parkingLabel?: string
  description?: string
}

export function hasDefaultFallbackStats(trail: TrailDoc): boolean {
  const source = String(trail.source ?? '').toLowerCase()
  return (
    Number(trail.miles) === 3 &&
    Number(trail.elevationGainFt ?? 0) === 0 &&
    trail.wta?.statsAvailable !== true &&
    (source === 'osm' || source === 'wta')
  )
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function slugFromName(value: string): string {
  return normalizeCorrectionName(value)
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function nameVariants(value: string): string[] {
  const normalized = normalizeCorrectionName(value)
  const variants = new Set<string>([normalized])

  for (const pattern of [
    /\s+river\s+loop$/i,
    /\s+creek\s+loop$/i,
    /\s+lake\s+loop$/i,
    /\s+loop$/i,
    /\s+route$/i,
  ]) {
    const trimmed = normalized.replace(pattern, '').trim()
    if (trimmed.length >= 4) variants.add(trimmed)
  }

  const words = normalized.split(/\s+/)
  if (words.length > 2) variants.add(words.slice(0, 2).join(' '))
  if (words.length > 3) variants.add(words.slice(0, 3).join(' '))

  return [...variants].filter(Boolean)
}

function titleLooksLikeMatch(title: string, targets: string[]): boolean {
  const candidate = normalizeCorrectionName(title)
  return targets.some(target => candidate === target || candidate.includes(target) || target.includes(candidate))
}

async function fetchTextWithTimeout(url: string): Promise<string> {
  const cached = textCache.get(url)
  if (cached) return cached

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
    const text = await res.text()
    textCache.set(url, text)
    return text
  } finally {
    clearTimeout(timeout)
  }
}

async function tryFetchText(url: string): Promise<string | null> {
  try {
    return await fetchTextWithTimeout(url)
  } catch {
    return null
  }
}

function extractPageTitle(html: string): string | undefined {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  if (h1) return stripTags(h1)

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return title ? stripTags(title).replace(/\s+[-\u2013\u2014]\s+Washington Trails Association$/i, '') : undefined
}

function extractSearchLinks(html: string): WtaMatch[] {
  const links = new Map<string, string>()
  const pattern = /<a[^>]+href="(https:\/\/www\.wta\.org\/go-hiking\/hikes\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/g

  for (const match of html.matchAll(pattern)) {
    const name = stripTags(match[2])
    if (name) links.set(match[1], name)
  }

  return [...links].map(([url, name]) => ({ url, name }))
}

async function findWtaTrail(trailName: string): Promise<WtaMatch | null> {
  const targets = nameVariants(trailName).slice(0, 4)

  for (const target of targets) {
    const directUrl = `${WTA_HIKE_URL}/${slugFromName(target)}`
    const directHtml = await tryFetchText(directUrl)
    if (!directHtml) continue

    const directName = extractPageTitle(directHtml) ?? trailName
    if (titleLooksLikeMatch(directName, targets)) return { url: directUrl, name: directName }
  }

  for (const target of targets.slice(0, 3)) {
    const url = new URL(WTA_SEARCH_URL)
    url.searchParams.set('searchabletext', target)
    url.searchParams.set('region', 'all')
    url.searchParams.set('subregion', 'all')

    const html = await fetchTextWithTimeout(url.toString())
    const links = extractSearchLinks(html)
    const match = links.find(link => titleLooksLikeMatch(link.name, targets))
    if (match) return match
  }

  return null
}

function numberFromText(value?: string): number | undefined {
  if (!value) return undefined
  const match = value.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  return match?.[1] ? Number(match[1]) : undefined
}

function extractStatValue(html: string, label: string): string | undefined {
  const pattern = new RegExp(
    `<div[^>]*class="[^"]*hike-stats__stat[^"]*"[^>]*>[\\s\\S]*?<dt[^>]*>[\\s\\S]*?${label}[\\s\\S]*?<\\/dt>[\\s\\S]*?<dd[^>]*>([\\s\\S]*?)<\\/dd>`,
    'i',
  )
  const match = html.match(pattern)
  return match?.[1] ? stripTags(match[1]) : undefined
}

function difficultyFromLabel(label?: string): Difficulty | undefined {
  if (!label) return undefined
  if (/strenuous|very hard|expert/i.test(label)) return 'Strenuous'
  if (/hard|difficult/i.test(label)) return 'Hard'
  if (/moderate/i.test(label)) return 'Moderate'
  if (/easy/i.test(label)) return 'Easy'
  return undefined
}

function difficultyFromStats(miles?: number, elevationGainFt?: number): Difficulty | undefined {
  if (!miles || miles <= 0 || typeof elevationGainFt !== 'number') return undefined
  if (miles <= 4 && elevationGainFt <= 700) return 'Easy'
  if (miles <= 8 && elevationGainFt <= 2000) return 'Moderate'
  if (miles <= 12 && elevationGainFt <= 3500) return 'Hard'
  return 'Strenuous'
}

function routeTypeFromLength(lengthLabel?: string): RouteType | undefined {
  if (!lengthLabel) return undefined
  if (/loop/i.test(lengthLabel)) return 'Loop'
  if (/one[-\s]?way|point/i.test(lengthLabel)) return 'PointToPoint'
  if (/round\s*trip|roundtrip/i.test(lengthLabel)) return 'OutAndBack'
  return undefined
}

function parkingTypeFromLabel(label?: string): ParkingPassType | undefined {
  if (!label) return undefined
  if (/northwest forest|nw forest/i.test(label)) return 'nw_forest_pass'
  if (/discover/i.test(label)) return 'discover_pass'
  if (/national park|america the beautiful|entrance fee/i.test(label)) return 'national_park_fee'
  if (/\bnone\b|no pass|no fee|free/i.test(label)) return 'free'
  return undefined
}

function extractParkingLabel(html: string): string | undefined {
  const match = html.match(/<h[2-5][^>]*>\s*Parking Pass\/Entry Fee\s*<\/h[2-5]>([\s\S]*?)(?=<h[2-5][^>]*>|<div class="wta-sidebar-layout__sidebar"|$)/i)
  if (!match?.[1]) return undefined

  const label = stripTags(match[1]).replace(/^:+/, '').trim()
  return label || undefined
}

function extractCoordinates(html: string): { lat: number; lng: number } | undefined {
  const lat =
    html.match(/"latitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?/i)?.[1] ??
    html.match(/property="latitude"\s+content="([^"]+)"/i)?.[1]
  const lng =
    html.match(/"longitude"\s*:\s*"?(-?\d+(?:\.\d+)?)"?/i)?.[1] ??
    html.match(/property="longitude"\s+content="([^"]+)"/i)?.[1]

  if (!lat || !lng) return undefined
  const parsedLat = Number(lat)
  const parsedLng = Number(lng)
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return undefined
  return { lat: parsedLat, lng: parsedLng }
}

function extractMetaDescription(html: string): string | undefined {
  const match =
    html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) ??
    html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)

  return match?.[1] ? decodeHtml(match[1]).replace(/\s+/g, ' ').trim().slice(0, 500) : undefined
}

function extractStats(html: string, match: WtaMatch): WtaStats {
  const lengthLabel = extractStatValue(html, 'Length')
  const gainLabel = extractStatValue(html, 'Elevation Gain')
  const highPointLabel = extractStatValue(html, 'Highest Point')
  const difficultyLabel = extractStatValue(html, 'Calculated Difficulty')
  const miles = numberFromText(lengthLabel)
  const elevationGainFt = numberFromText(gainLabel)
  const highestPointFt = numberFromText(highPointLabel)
  const coords = extractCoordinates(html)
  const parkingLabel = extractParkingLabel(html)

  return {
    url: match.url,
    name: match.name,
    lat: coords?.lat,
    lng: coords?.lng,
    miles,
    elevationGainFt,
    trailheadElevationFt: highestPointFt !== undefined && elevationGainFt !== undefined
      ? Math.max(0, highestPointFt - elevationGainFt)
      : undefined,
    difficulty: difficultyFromLabel(difficultyLabel) ?? difficultyFromStats(miles, elevationGainFt),
    routeType: routeTypeFromLength(lengthLabel),
    parkingType: parkingTypeFromLabel(parkingLabel),
    parkingLabel,
    description: extractMetaDescription(html),
  }
}

function statsAreUsable(stats: WtaStats): boolean {
  return !!(stats.miles && stats.miles > 0 && (typeof stats.elevationGainFt === 'number' || stats.difficulty))
}

function landOwnerFromParking(parkingType?: ParkingPassType): string {
  if (parkingType === 'nw_forest_pass') return 'USFS'
  if (parkingType === 'national_park_fee') return 'NPS'
  if (parkingType === 'discover_pass') return 'DNR'
  return 'Other'
}

export async function enrichTrailStatsFromWta(trail: TrailDoc): Promise<TrailDoc> {
  if (!hasDefaultFallbackStats(trail)) return trail

  const match = await findWtaTrail(String(trail.name ?? ''))
  if (!match) return trail

  const html = await fetchTextWithTimeout(match.url)
  const stats = extractStats(html, match)
  if (!statsAreUsable(stats)) return trail

  const lat = typeof stats.lat === 'number' ? stats.lat : trail.lat
  const lng = typeof stats.lng === 'number' ? stats.lng : trail.lng
  const region = typeof lat === 'number' && typeof lng === 'number'
    ? regionFromLatLng(lat, lng)
    : trail.region
  const parkingType = stats.parkingType ?? trail.parking?.type ?? 'unknown'
  const now = new Date().toISOString()

  return {
    ...trail,
    name: cleanName(stats.name),
    region,
    pk: trail.pk ?? region,
    lat,
    lng,
    miles: stats.miles,
    elevationGainFt: stats.elevationGainFt ?? trail.elevationGainFt ?? 0,
    trailheadElevationFt: stats.trailheadElevationFt ?? trail.trailheadElevationFt,
    difficulty: stats.difficulty ?? trail.difficulty ?? 'Moderate',
    routeType: stats.routeType ?? trail.routeType ?? 'OutAndBack',
    landOwner: trail.landOwner ?? landOwnerFromParking(parkingType),
    parking: {
      ...(trail.parking ?? {}),
      type: parkingType,
      notes: stats.parkingLabel ? `WTA: ${stats.parkingLabel}` : trail.parking?.notes,
      confidence: parkingType === 'unknown' ? trail.parking?.confidence ?? 'medium' : 'high',
    },
    description: stats.description ?? trail.description,
    source: 'wta',
    statsConfidence: 'high',
    wta: {
      ...(trail.wta ?? {}),
      name: stats.name,
      url: stats.url,
      syncedAt: now,
      statsSyncedAt: now,
      status: 'matched',
      statsAvailable: true,
      parkingChecked: true,
      accessChecked: true,
      statsChecked: true,
    },
  }
}

export async function enrichDefaultStatsFromWta(trails: TrailDoc[], limit = 4): Promise<TrailDoc[]> {
  let remaining = limit

  return Promise.all(trails.map(async trail => {
    if (remaining <= 0 || !hasDefaultFallbackStats(trail)) return trail
    remaining--
    try {
      return await enrichTrailStatsFromWta(trail)
    } catch {
      return trail
    }
  }))
}
