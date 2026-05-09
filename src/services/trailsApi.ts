import type { Trail } from '../domain/types'
import type { FilterState, SortKey } from '../domain/filters'

export interface TrailsApiResponse {
  trails:  Trail[]
  total:   number
  page:    number
  limit:   number
  hasMore: boolean
}

export interface TrailBounds {
  north: number
  south: number
  east:  number
  west:  number
}

const RESPONSE_CACHE_TTL_MS = 20 * 60 * 1000
const PERSISTED_RESPONSE_CACHE_TTL_MS = 60 * 60 * 1000
const RESPONSE_CACHE_MAX_ENTRIES = 150
const PERSISTED_RESPONSE_CACHE_MAX_ENTRIES = 60
const API_DATA_VERSION = '2026-05-09-wta-alias-stats'
const STORAGE_PREFIX = 'wa-hiking:trails:v7:'
const STORAGE_INDEX_KEY = `${STORAGE_PREFIX}index`
const responseCache = new Map<string, { cachedAt: number; data: TrailsApiResponse }>()

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

function storageKey(url: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(url)}`
}

function readStorageIndex(): string[] {
  if (!storageAvailable()) return []

  try {
    const raw = window.localStorage.getItem(STORAGE_INDEX_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(key => typeof key === 'string') : []
  } catch {
    return []
  }
}

function writeStorageIndex(keys: string[]) {
  if (!storageAvailable()) return

  try {
    window.localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(keys))
  } catch {
    // Storage is an opportunistic speed boost; failing here should never break the app.
  }
}

function prunePersistedResponses(latestKey: string) {
  if (!storageAvailable()) return

  const keys = [latestKey, ...readStorageIndex().filter(key => key !== latestKey)]
  while (keys.length > PERSISTED_RESPONSE_CACHE_MAX_ENTRIES) {
    const staleKey = keys.pop()
    if (staleKey) window.localStorage.removeItem(staleKey)
  }
  writeStorageIndex(keys)
}

function readPersistedResponse(url: string): TrailsApiResponse | null {
  if (!storageAvailable()) return null

  const key = storageKey(url)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const cached = JSON.parse(raw) as { cachedAt?: number; data?: TrailsApiResponse }
    if (!cached.cachedAt || !cached.data) return null
    if (Date.now() - cached.cachedAt > PERSISTED_RESPONSE_CACHE_TTL_MS) {
      window.localStorage.removeItem(key)
      return null
    }

    responseCache.set(url, { cachedAt: cached.cachedAt, data: cached.data })
    prunePersistedResponses(key)
    return cached.data
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

function rememberPersistedResponse(url: string, data: TrailsApiResponse) {
  if (!storageAvailable()) return

  const key = storageKey(url)
  try {
    window.localStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), data }))
    prunePersistedResponses(key)
  } catch {
    // Ignore quota/private-mode failures and continue with in-memory caching.
  }
}

function rememberResponse(url: string, data: TrailsApiResponse) {
  responseCache.set(url, { cachedAt: Date.now(), data })
  if (responseCache.size <= RESPONSE_CACHE_MAX_ENTRIES) return

  const oldestKey = responseCache.keys().next().value
  if (oldestKey) responseCache.delete(oldestKey)
}

function readCachedResponse(url: string): TrailsApiResponse | null {
  const cached = responseCache.get(url)
  if (cached && Date.now() - cached.cachedAt < RESPONSE_CACHE_TTL_MS) return cached.data

  return readPersistedResponse(url)
}

export async function fetchTrails(
  filters: FilterState,
  query:   string,
  sort:    SortKey,
  page   = 1,
  limit  = 50,
  bounds?: TrailBounds,
  signal?: AbortSignal,
): Promise<TrailsApiResponse> {
  const params = new URLSearchParams()
  params.set('v', API_DATA_VERSION)
  params.set('page',  String(page))
  params.set('limit', String(limit))
  params.set('sort',  sort)

  if (query.trim())                       params.set('q', query.trim())
  if (filters.conditionOverall !== 'any') params.set('condition', filters.conditionOverall)
  if (filters.accessLevel      !== 'any') params.set('access',    filters.accessLevel)
  if (filters.parkingType      !== 'any') params.set('parking',   filters.parkingType)
  if (filters.maxMiles         !== null)  params.set('maxMiles',  String(filters.maxMiles))
  if (filters.difficulty.length)          params.set('difficulty', filters.difficulty.join(','))
  if (filters.region.length)              params.set('region',     filters.region.join(','))
  if (bounds) {
    params.set('north', String(bounds.north))
    params.set('south', String(bounds.south))
    params.set('east',  String(bounds.east))
    params.set('west',  String(bounds.west))
  }

  const url = `/api/trails?${params}`
  const cached = readCachedResponse(url)
  if (cached) return cached

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json() as TrailsApiResponse
  rememberResponse(url, data)
  rememberPersistedResponse(url, data)
  return data
}

export async function fetchTrailById(id: string): Promise<Trail> {
  const res = await fetch(`/api/trail?id=${encodeURIComponent(id)}&v=${encodeURIComponent(API_DATA_VERSION)}`)
  if (!res.ok) throw new Error(`Trail not found: ${id}`)
  return res.json() as Promise<Trail>
}
