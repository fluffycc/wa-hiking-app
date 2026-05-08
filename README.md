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
| NOAA Weather | Snow, rain, temperature by WA region | None |
| WSDOT Pass Conditions | Mountain pass access warnings only | Free key |
| Washington Trails Association | Enriched parking pass, WTA link, road/access notes | Public pages |

WSDOT is intentionally not treated as proof of trail closure because pass closures are too broad for individual trails.

## Map Dot Rules

Trail dots are deliberately conservative:

- Red: actual trail-specific closure.
- Yellow: significant snow or concrete trailhead access difficulty, such as rough road, high-clearance, 4x4, washout, potholes, or impassable access.
- Green: everything else, including unknown access.

Access warnings can still appear in the trail details panel without turning the dot yellow.

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

WTA sync is intentionally incremental (`limit=10` in the workflow) because it reads public WTA pages and should not run as a heavy crawler.

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
- Short client-side viewport cache in Zustand.
- API `Cache-Control` headers for `/api/trails`.

Cosmos DB is still the main latency source for brand-new map areas. A future map-tile or geohash endpoint would be the next major speed upgrade.
