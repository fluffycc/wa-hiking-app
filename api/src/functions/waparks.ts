import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'
import { regionFromLatLng, cleanName } from '../../shared/trailMapper'

const SOCRATA_PARKS_URL = 'https://data.wa.gov/resource/qeqb-pjy8.json'
const WA_GOV_PARKS_URL = 'https://wa.gov/recreation/parks'
const PAGE_SIZE = 1000
const FETCH_TIMEOUT_MS = 60_000
const UPSERT_BATCH_SIZE = 25
const DETAIL_FETCH_BATCH_SIZE = 10
const WA_GOV_MAX_PAGES = 8

interface WAParkRecord {
  site_name?: string
  park_name?: string
  type_class?: string
  trails?: string
  trail_miles?: string
  latitude?: string
  longitude?: string
  discover_pass_required?: string
  amenities?: string
  [key: string]: unknown
}

function getSyncTokenFromRequest(req: HttpRequest): string | null {
  const token =
    req.headers.get('x-sync-token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(req.url).searchParams.get('token')

  return token?.trim() || null
}

function validateSyncToken(req: HttpRequest): boolean {
  const token = getSyncTokenFromRequest(req)
  const secret =
    process.env['SYNC_SECRET_TOKEN'] ??
    process.env['SYNC_TOKEN'] ??
    process.env['SYNC_SECRET']

  return !!token && !!secret && token === secret
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
    return await res.json() as T
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchTextWithTimeout(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WAHikingApp/1.0 (contact: you@example.com)' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(worker))
  }
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    results.push(...await Promise.all(items.slice(i, i + batchSize).map(worker)))
  }
  return results
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

function extractParkLinks(html: string): string[] {
  const links = new Set<string>()
  for (const match of html.matchAll(/href="https:\/\/wa\.gov(\/recreation\/parks\/[^"#?]+)"/g)) {
    links.add(`https://wa.gov${match[1]}`)
  }
  return [...links]
}

function extractFirst(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern)
  return match?.[1] ? decodeHtml(match[1].replace(/<[^>]+>/g, '').trim()) : undefined
}

async function fetchSocrataParkRecords(): Promise<WAParkRecord[]> {
  const allRecords: WAParkRecord[] = []
  let offset = 0

  while (true) {
    const url = new URL(SOCRATA_PARKS_URL)
    url.searchParams.set('$limit', String(PAGE_SIZE))
    url.searchParams.set('$offset', String(offset))
    url.searchParams.set('$where', "trail_miles > 0 OR trails = 'Yes'")

    const records = await fetchJsonWithTimeout<WAParkRecord[]>(url.toString())
    if (!records.length) break

    allRecords.push(...records)
    if (records.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return allRecords
}

async function fetchWAGovParkLinks(): Promise<string[]> {
  const links = new Set<string>()

  for (let page = 0; page < WA_GOV_MAX_PAGES; page++) {
    const url = new URL(WA_GOV_PARKS_URL)
    url.searchParams.set('field_park_type_target_id', 'State')
    url.searchParams.set('page', String(page))

    const pageLinks = extractParkLinks(await fetchTextWithTimeout(url.toString()))
    if (!pageLinks.length) break
    pageLinks.forEach(link => links.add(link))
  }

  return [...links]
}

async function fetchWAGovParkRecord(url: string): Promise<WAParkRecord | null> {
  const html = await fetchTextWithTimeout(url)
  if (!/(Accessible Trails|Bike Trails|Equestrian Trails|Hiking Trails)/i.test(html)) return null

  const name = extractFirst(html, /field--name-title[^>]*>.*?<span[^>]*>(.*?)<\/span>/s)
  const latitude = extractFirst(html, /property="latitude"\s+content="([^"]+)"/)
  const longitude = extractFirst(html, /property="longitude"\s+content="([^"]+)"/)

  if (!name || !latitude || !longitude) return null

  return {
    site_name: name,
    park_name: name,
    trails: 'Yes',
    trail_miles: '1',
    latitude,
    longitude,
    discover_pass_required: 'Yes',
  }
}

async function fetchWAGovParkRecords(context: InvocationContext): Promise<WAParkRecord[]> {
  const links = await fetchWAGovParkLinks()
  context.log(`WA.gov parks fallback: ${links.length} park pages found`)

  const records = await mapInBatches(links, DETAIL_FETCH_BATCH_SIZE, async (link) => {
    try {
      return await fetchWAGovParkRecord(link)
    } catch (err) {
      context.warn(`WA.gov park fetch failed for ${link}`, err)
      return null
    }
  })

  return records.filter((record): record is WAParkRecord => !!record)
}

async function waparksSyncHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    if (!validateSyncToken(req)) return { status: 401, jsonBody: { error: 'Unauthorized' } }

    context.log('Starting WA State Parks sync...')
    let upserted = 0
    const container = getTrailsContainer()
    let source = 'socrata'
    let warning: string | undefined
    let records: WAParkRecord[]

    try {
      records = await fetchSocrataParkRecords()
    } catch (err) {
      context.warn('WA State Parks Socrata source unavailable; falling back to WA.gov pages', err)
      source = 'wa.gov'
      try {
        records = await fetchWAGovParkRecords(context)
      } catch (fallbackErr) {
        warning = `WA State Parks sources unavailable: Socrata=${String(err)}; WA.gov=${String(fallbackErr)}`
        context.warn(warning)
        records = []
      }
    }

    context.log(`WA State Parks: ${records.length} trail parks from ${source}`)

    if (!records.length) {
      return { status: 200, jsonBody: { ok: true, upserted, source, warning: warning ?? 'No WA State Parks trail records found' } }
    }

    await runInBatches(records, UPSERT_BATCH_SIZE, async (park) => {
      const lat = parseFloat(park.latitude ?? '0')
      const lng = parseFloat(park.longitude ?? '0')
      if (!lat || !lng) return

      const name = park.site_name ?? park.park_name ?? 'Unknown Park'
      const trailMiles = parseFloat(park.trail_miles ?? '1')
      const region = regionFromLatLng(lat, lng)
      const discoverPass = (park.discover_pass_required ?? '').toLowerCase() === 'yes'

      const trailDoc = {
        id: `waparks-${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}`,
        pk: region,
        name: cleanName(name),
        region,
        lat,
        lng,
        miles: trailMiles > 0 ? trailMiles : 2.0,
        elevationGainFt: 0,
        difficulty: 'Easy' as const,
        routeType: 'Loop' as const,
        landOwner: 'StateParks' as const,
        parking: {
          type: discoverPass ? 'discover_pass' as const : 'free' as const,
          notes: discoverPass ? 'Discover Pass required' : 'No pass required',
          confidence: 'high' as const,
        },
        access: { level: 'sedan_ok' as const, confidence: 'high' as const },
        conditions: {
          overall: 'unknown' as const,
          snow: 'none' as const,
          mud: 'dry' as const,
          bugs: 'none' as const,
          notes: [],
        },
        description: `WA State Park with ${trailMiles} miles of trails`,
        source: 'wa_parks' as const,
        syncedAt: new Date().toISOString(),
      }

      await container.items.upsert(trailDoc)
      upserted++
    })

    return { status: 200, jsonBody: { ok: true, upserted, source, warning } }
  } catch (err) {
    context.error('WA Parks sync failed:', err)
    return { status: 500, jsonBody: { ok: false, error: String(err) } }
  }
}

app.http('sync-waparks', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: waparksSyncHandler,
})
