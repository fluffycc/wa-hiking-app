# Codex Project Notes

This file replaces the old Claude session notes. Use it as the working context for Codex changes.

## Product Intent

WA Hiking App is a mobile-first Washington trail map. It should feel practical, fast, and field-useful: quick map browsing, simple search, clear access and parking information, and conservative safety signals.

## User Experience Rules

- Default tab is Map.
- Detail summary badges should show Access and Parking only.
- Search on the map should behave like a natural suggestion box, not only filter the current viewport.
- The details panel should prioritize current condition, access, parking, and basics.
- Do not show placeholder trip-report sections unless real trip-report data is available.
- Feedback must go through `/api/feedback`; do not call GitHub from browser code.

## Map Dot Rules

Keep pin colors simple:

- Red only for trail-specific closure.
- Green for everything else.

Do not make a dot yellow because parking is unknown, access is unknown, WSDOT has a broad pass advisory, the road is rough, snow is present, mud is possible, or `conditions.overall` is generically `caution`. Those warnings belong inside the trail details panel.

## Data Pipeline

Function routes live in `api/src/functions`, but Azure Functions v4 only registers routes imported by `api/index.ts`.

Current sync functions:

- `sync-osm`
- `sync-wadnr`
- `sync-waparks`
- `sync-wta`
- `sync-conditions`

The scheduled GitHub workflow runs the full sync chain twice per day. WTA enrichment is incremental by design and must stay under the Static Web Apps backend timeout, so keep its scheduled limit modest. It prioritizes trails missing WTA stats or permit data and marks checked trails so repeated workflow runs make progress without crawling WTA too aggressively. WTA should overwrite broad OSM defaults for distance, elevation gain, difficulty, route type, and parking pass. It can also seed WTA-native records for important missing hikes; keep the default seed list small.

`api/shared/trailCorrections.ts` applies read-time corrections for known WTA-authoritative records, which helps stale OSM defaults disappear immediately after deploy and cache refresh.

## Search

Map search fetches up to 50 API matches, then ranks them client-side:

1. Exact name match.
2. Name starts with query.
3. Any word starts with query.
4. Query appears as a full word.
5. Query appears anywhere.

This keeps searches like `lake` from returning an alphabetized list of unrelated names first.

## Performance

The current performance strategy is:

- Round viewport bounds before requests.
- Cache viewport responses in Zustand for 30 minutes.
- Persist recent `/api/trails` responses in browser storage for 30 minutes.
- Send cache headers from `/api/trails`.
- Keep viewport result size capped at 50.
- Keep map movement constrained to Washington.
- Conditions sync should store regional NOAA snapshots and let `/api/trails` and `/api/trail` overlay conditions at read time. Do not patch every trail during conditions sync; it can exceed the Static Web Apps backend timeout.

The next meaningful upgrade is a geohash or map-tile style trail endpoint backed by precomputed cells in Cosmos.

## Verification Before Push

Run:

```bash
npm run build
npm run test -- --run
cd api
npm run build
```

If API routes return 404 after deploy, first check `api/index.ts` for a missing import.
