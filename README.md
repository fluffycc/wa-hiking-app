# WA Hiking App

Mobile-first Washington hiking map built with React, Azure Static Web Apps, Azure Functions, and Cosmos DB.

The app answers four practical questions:

- Can I go today?
- Can I get to the trailhead?
- What parking pass do I need?
- Which trails are nearby or searchable by name?

## Current Stack

| Area | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| Map | Leaflet via `react-leaflet` |
| State | Zustand |
| API | Azure Static Web Apps managed Functions |
| Database | Azure Cosmos DB NoSQL |
| Tests | Vitest |
| Agent docs | `CODEX.md` |

## Data Sources

| Source | Used for | Auth |
|---|---|---|
| OpenStreetMap Overpass | Base trail records | None |
| WA DNR GIS | WA DNR trails and forest road maintenance | None |
| WA State Parks / wa.gov | State park trails and Discover Pass defaults | None |
| NOAA Weather | Regional forecast snapshots overlaid on trails at read time | None |
| WSDOT Pass Conditions | Mountain pass access warnings only | Free key |
| Washington Trails Association | Authoritative trail stats, missing-trail seeds, parking pass, WTA link, road/access notes | Public pages |

WSDOT is intentionally not treated as proof of trail closure because pass closures are too broad for individual trails.
Legacy WSDOT pass alerts are filtered out of trail API responses so they do not color or clutter individual trail details.

## Map Dot Rules

Trail dots are deliberately conservative:

- Red: actual trail-specific closure.
- Green: everything else, including snow, road cautions, rough access, pass advisories, parking uncertainty, and unknown access.

Access and condition warnings can still appear as yellow information in the trail details panel without turning the map dot yellow.

## Local Development

Install dependencies:

```bash
npm install
cd api
npm install
```

Run frontend only:

```bash
npm run dev
```

Run frontend plus Azure Functions locally:

```bash
npm install -g @azure/static-web-apps-cli azure-functions-core-tools@4
npm run dev
swa start http://localhost:5173 --api-location api
```

## Required Environment

Copy `.env.example` and set these values in Azure Static Web Apps configuration:

```bash
COSMOS_ENDPOINT=
COSMOS_KEY=
COSMOS_DB_NAME=wa-hiking
COSMOS_CONTAINER=trails
SYNC_SECRET_TOKEN=
WSDOT_ACCESS_CODE=
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=wa-hiking-app
GITHUB_LABELS=feedback,from-app
```

GitHub Actions also needs:

```bash
SWA_API_URL=https://your-static-web-app.azurestaticapps.net
SYNC_SECRET_TOKEN=same-value-as-azure
```

## Data Sync

Run from GitHub Actions: `Sync Trail Data`.

Available manual modes:

- `osm`: base OSM trails.
- `wadnr`: WA DNR trails and road maintenance data.
- `waparks`: WA State Parks enrichment.
- `wta`: incremental WTA parking/access enrichment.
- `conditions`: NOAA and WSDOT warning refresh.
- `all`: full pipeline.

The scheduled workflow runs the full pipeline twice per day at `03:00` and `15:00` UTC, which is roughly evening and morning Pacific time depending on daylight saving time.

WTA sync is intentionally incremental (`limit=20` in the workflow) because it reads public WTA pages through Azure Static Web Apps, which can fail long requests near the 45-second mark. It prioritizes trails missing WTA stats or permit data. WTA should overwrite broad OSM defaults for distance, elevation gain, difficulty, route type, and parking pass.

WTA sync also seeds a small set of high-confidence WTA-native trail records for important hikes that broad OSM sync can miss or mis-measure, including Lake 22 and Heather Lake on the Mountain Loop Highway. Additional one-off WTA seeds can be requested with `sync-wta?seed=Trail%20Name`.

The trail read APIs also apply a small authoritative correction table for known WTA-backed records so stale OSM defaults like `3 miles / Easy` do not leak through while Cosmos is catching up.

## Build And Test

Frontend:

```bash
npm run build
npm run test -- --run
```

API:

```bash
cd api
npm run build
```

## Important API Note

Azure Functions v4 route registration is explicit. Every function in `api/src/functions` must be imported from `api/index.ts`, otherwise it will compile but deploy as a 404 route.

## Performance Notes

The map uses three layers of caching:

- Coarse viewport rounding before requesting trails.
- 30-minute client-side viewport cache in Zustand.
- 30-minute persisted browser cache for `/api/trails` responses.
- Short warm-instance response cache in the Azure Function.
- API `Cache-Control` headers for `/api/trails`.
- Viewport results capped at 50 trails to keep the map light on mobile.
- Map panning is constrained to Washington to avoid unnecessary out-of-state work.
- Conditions sync writes 8 regional weather snapshots instead of patching every trail, so weather refreshes stay under the Static Web Apps backend timeout.

Cosmos DB is still the main latency source for brand-new map areas. A future map-tile or geohash endpoint would be the next major speed upgrade.
