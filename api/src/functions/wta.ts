import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTrailsContainer } from '../../shared/cosmosClient'

const WTA_SEARCH_URL = 'https://www.wta.org/go-outside/hikes/hike_search'
const WTA_HIKE_URL = 'https://www.wta.org/go-hiking/hikes'
const FETCH_TIMEOUT_MS = 20_000
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 75
const DETAIL_BATCH_SIZE = 2
const MAX_RUN_MS = 110_000
const USER_AGENT = 'WAHikingApp/1.0 (contact: you@example.com)'
const textCache = new Map<string, string>()

type ParkingPassType = 'free' | 'discover_pass' | 'nw_forest_pass' | 'national_park_fee' | 'unknown'
type AccessLevel = 'sedan_ok' | 'rough' | 'high_clearance' | '4x4_only' | 'unknown'

interface TrailProjection {
  id: string
  pk?: string
  name: string
  region?: string
  parking?: {
    type?: ParkingPassType
    notes?: string
    confidence?: string
  }
  access?: {
    level?: AccessLevel
    notes?: string
    confidence?: string
  }
  roadCondition?: {
    surface?: string
    condition?: string
    notes?: string
    confidence?: string
    lastUpdatedISO?: string
  }
  alerts?: Array<{
    type: 'closure' | 'warning' | 'info'
    message: string
    source: string
    expiresISO?: string
    reportedISO: string
  }>
}

interface WTAEnrichment {
  url: string
  wtaName: string
  parkingLabel?: string
  parkingType?: ParkingPassType
  accessLevel?: AccessLevel
  roadNotes?: string
  alert?: {
    type: 'closure' | 'warning'
    message: string
    source: 'WTA'
    reportedISO: string
  }
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

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\([^)]*\)/g, '')
    .replace(/\btrail\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugFromName(value: string): string {
  return normalizeName(value)
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extractPageTitle(html: string): string | undefined {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  if (h1) return stripTags(h1)

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return title ? stripTags(title).replace(/\s+[-\u2013\u2014]\s+Washington Trails Association$/i, '') : undefined
}

function extractSearchLinks(html: string): Array<{ url: string; name: string }> {
  const links = new Map<string, string>()
  const pattern = /<a[^>]+href="(https:\/\/www\.wta\.org\/go-hiking\/hikes\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/g

  for (const match of html.matchAll(pattern)) {
    const name = stripTags(match[2])
    if (name) links.set(match[1], name)
  }

  return [...links].map(([url, name]) => ({ url, name }))
}

async function findWtaTrail(trailName: string): Promise<{ url: string; name: string } | null> {
  const target = normalizeName(trailName)
  const directUrl = `${WTA_HIKE_URL}/${slugFromName(trailName)}`
  const directHtml = await tryFetchText(directUrl)
  if (directHtml) {
    const directName = extractPageTitle(directHtml) ?? trailName
    if (normalizeName(directName) === target) return { url: directUrl, name: directName }
  }

  const url = new URL(WTA_SEARCH_URL)
  url.searchParams.set('searchabletext', trailName)

  const html = await fetchTextWithTimeout(url.toString())
  const links = extractSearchLinks(html)
  if (!links.length) return null

  return (
    links.find(link => normalizeName(link.name) === target) ??
    links.find(link => {
      const candidate = normalizeName(link.name)
      return candidate.includes(target) || target.includes(candidate)
    }) ??
    links[0]
  )
}

function extractSection(html: string, title: string): string | undefined {
  const pattern = new RegExp(`<h[2-4][^>]*>\\s*${title}\\s*<\\/h[2-4]>([\\s\\S]*?)(?=<h[2-4][^>]*>|$)`, 'i')
  const match = html.match(pattern)
  return match?.[1] ? stripTags(match[1]) : undefined
}

function extractParkingLabel(html: string): string | undefined {
  const match = html.match(/<h[2-5][^>]*>\s*Parking Pass\/Entry Fee\s*<\/h[2-5]>([\s\S]*?)(?=<h[2-5][^>]*>|<div class="wta-sidebar-layout__sidebar"|$)/i)
  if (!match?.[1]) return undefined

  const label = stripTags(match[1])
    .replace(/^:+/, '')
    .trim()

  return label || undefined
}

function parkingTypeFromLabel(label?: string): ParkingPassType | undefined {
  if (!label) return undefined
  if (/northwest forest|nw forest/i.test(label)) return 'nw_forest_pass'
  if (/discover/i.test(label)) return 'discover_pass'
  if (/national park|america the beautiful|entrance fee/i.test(label)) return 'national_park_fee'
  if (/\bnone\b|no pass|no fee|free/i.test(label)) return 'free'
  return undefined
}

function accessFromRoadNotes(notes?: string): AccessLevel | undefined {
  if (!notes) return undefined
  if (/\b(4wd|4x4|four wheel|high-clearance|high clearance)\b/i.test(notes)) return 'high_clearance'
  if (/\b(potholes?|rough|rutted|washout|washed out|primitive road|gravel road)\b/i.test(notes)) return 'rough'
  return undefined
}

function firstUsefulSentence(text?: string): string | undefined {
  if (!text) return undefined
  const normalized = text.replace(/\s+/g, ' ').trim()
  const sentence = normalized.match(/[^.!?]*(closed|closure|inaccessible|road work|potholes?|rough|washout|washed out)[^.!?]*[.!?]?/i)?.[0]
  return sentence?.trim().slice(0, 320)
}

function buildAlert(beforeYouGo?: string): WTAEnrichment['alert'] {
  const sentence = firstUsefulSentence(beforeYouGo)
  if (!sentence) return undefined

  const isTrailClosure =
    /\btrail\b[^.]{0,80}\b(closed|closure|inaccessible)\b/i.test(sentence) ||
    /\b(closed|closure|inaccessible)\b[^.]{0,80}\btrail\b/i.test(sentence)

  return {
    type: isTrailClosure ? 'closure' : 'warning',
    message: sentence,
    source: 'WTA',
    reportedISO: new Date().toISOString(),
  }
}

async function enrichFromWta(trail: TrailProjection): Promise<WTAEnrichment | null> {
  const match = await findWtaTrail(trail.name)
  if (!match) return null

  const html = await fetchTextWithTimeout(match.url)
  const parkingLabel = extractParkingLabel(html)
  const gettingThere = extractSection(html, 'Getting There')
  const beforeYouGo = extractSection(html, 'Before You Go')
  const roadNotes = firstUsefulSentence(gettingThere)

  return {
    url: match.url,
    wtaName: match.name,
    parkingLabel,
    parkingType: parkingTypeFromLabel(parkingLabel),
    accessLevel: accessFromRoadNotes(roadNotes),
    roadNotes,
    alert: buildAlert(beforeYouGo),
  }
}

function patchForEnrichment(trail: TrailProjection, enrichment: WTAEnrichment) {
  const ops: Array<{ op: 'set'; path: string; value: unknown }> = [
    {
      op: 'set',
      path: '/wta',
      value: {
        name: enrichment.wtaName,
        url: enrichment.url,
        syncedAt: new Date().toISOString(),
        status: 'matched',
        parkingChecked: true,
        accessChecked: true,
      },
    },
  ]

  if (enrichment.parkingType) {
    ops.push({
      op: 'set',
      path: '/parking',
      value: {
        ...(trail.parking ?? {}),
        type: enrichment.parkingType,
        notes: enrichment.parkingLabel ? `WTA: ${enrichment.parkingLabel}` : trail.parking?.notes,
        confidence: 'high',
      },
    })
  }

  if (enrichment.accessLevel || enrichment.roadNotes) {
    const accessLevel = enrichment.accessLevel ?? trail.access?.level ?? 'unknown'
    ops.push({
      op: 'set',
      path: '/access',
      value: {
        ...(trail.access ?? {}),
        level: accessLevel,
        notes: enrichment.roadNotes ? `WTA: ${enrichment.roadNotes}` : trail.access?.notes,
        confidence: enrichment.roadNotes ? 'high' : trail.access?.confidence ?? 'medium',
      },
    })
    ops.push({
      op: 'set',
      path: '/roadCondition',
      value: {
        ...(trail.roadCondition ?? {}),
        surface: trail.roadCondition?.surface ?? 'unknown',
        condition: accessLevel === 'rough' || accessLevel === 'high_clearance' ? 'rough' : trail.roadCondition?.condition ?? 'unknown',
        notes: enrichment.roadNotes ? `WTA: ${enrichment.roadNotes}` : trail.roadCondition?.notes,
        confidence: enrichment.roadNotes ? 'high' : trail.roadCondition?.confidence ?? 'medium',
        lastUpdatedISO: new Date().toISOString(),
      },
    })
  }

  if (enrichment.alert) {
    const alerts = (trail.alerts ?? []).filter(alert => alert.source !== 'WTA')
    ops.push({
      op: 'set',
      path: '/alerts',
      value: [...alerts, enrichment.alert],
    })
  }

  return ops
}

function patchForWtaMiss() {
  return [
    {
      op: 'set' as const,
      path: '/wta',
      value: {
        syncedAt: new Date().toISOString(),
        status: 'not_found',
        parkingChecked: true,
        accessChecked: true,
      },
    },
  ]
}

async function wtaSyncHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const startedAt = Date.now()
  const requestId = Math.random().toString(36).slice(2)

  try {
    if (!validateSyncToken(req)) {
      return { status: 401, jsonBody: { ok: false, error: 'Unauthorized', requestId } }
    }

    const url = new URL(req.url)
    const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
    const force = url.searchParams.get('force') === 'true'
    const name = url.searchParams.get('name')?.trim()
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT))
    const container = getTrailsContainer()
    const where = name
      ? 'WHERE IS_DEFINED(t.name) AND CONTAINS(LOWER(t.name), @name)'
      : force
        ? 'WHERE IS_DEFINED(t.name)'
        : [
            'WHERE IS_DEFINED(t.name) AND (',
            'NOT IS_DEFINED(t.wta.syncedAt)',
            "OR NOT IS_DEFINED(t.parking.type)",
            "OR t.parking.type = 'unknown'",
            ')',
          ].join(' ')
    const querySpec = {
      query: [
        `SELECT TOP ${limit} t.id, t.pk, t.name, t.region, t.parking, t.access, t.roadCondition, t.alerts`,
        'FROM t',
        where,
      ].join(' '),
      parameters: name ? [{ name: '@name', value: name.toLowerCase() }] : [],
    }

    context.log(`[WTA][${requestId}] query start limit=${limit} force=${force} name=${name ?? '<none>'}`)
    const { resources } = await container.items.query(querySpec, { enableCrossPartitionQuery: true }).fetchAll()
    const trails = (resources ?? []) as TrailProjection[]
    context.log(`[WTA][${requestId}] trails loaded: ${trails.length}`)

    let checked = 0
    let matched = 0
    let updated = 0
    let errors = 0
    let stoppedEarly = false

    await mapInBatches(trails, DETAIL_BATCH_SIZE, async (trail) => {
      if (Date.now() - startedAt > MAX_RUN_MS) {
        stoppedEarly = true
        return
      }

      try {
        const enrichment = await enrichFromWta(trail)
        checked++

        if (!enrichment) {
          await container.item(trail.id, trail.pk ?? trail.region).patch(patchForWtaMiss())
          updated++
          return
        }

        matched++
        const ops = patchForEnrichment(trail, enrichment)
        await container.item(trail.id, trail.pk ?? trail.region).patch(ops)
        updated++
      } catch (err) {
        errors++
        context.warn(`[WTA][${requestId}] enrichment failed for ${trail.name}`, err)
      }
    })

    return {
      status: 200,
      jsonBody: {
        ok: true,
        requestId,
        checked,
        matched,
        updated,
        errors,
        stoppedEarly,
        durationMs: Date.now() - startedAt,
      },
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    context.error(`[WTA][${requestId}] fatal`, error)

    return {
      status: 500,
      jsonBody: {
        ok: false,
        requestId,
        error: error.message,
        durationMs: Date.now() - startedAt,
      },
    }
  }
}

app.http('sync-wta', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  handler: wtaSyncHandler,
})
