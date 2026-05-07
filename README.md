# WA Trail Finder

Mobile-first WA hiking app with live trail data from OSM, WA DNR, WA State Parks, and NOAA — all free.

## Quick Start (local, sample data)
```bash
npm install && npm run dev
```

## Full Setup (1000+ live trails)

### 1. Azure Cosmos DB (free serverless tier)
- portal.azure.com → Cosmos DB → Create → NoSQL → Serverless
- Create database `wa-hiking`, container `trails`, partition key `/pk`
- Copy URI and Primary Key

### 2. Fill in `.env.local` (copy from `.env.example`)

### 3. Run locally with API
```bash
npm install -g @azure/static-web-apps-cli
swa start http://localhost:5173 --api-location api
```

### 4. Populate database (run once)
```bash
curl -X POST http://localhost:7071/api/sync-osm    -H "x-sync-token: YOUR_TOKEN"
curl -X POST http://localhost:7071/api/sync-wadnr  -H "x-sync-token: YOUR_TOKEN"
curl -X POST http://localhost:7071/api/sync-waparks -H "x-sync-token: YOUR_TOKEN"
curl -X POST http://localhost:7071/api/sync-conditions -H "x-sync-token: YOUR_TOKEN"
```

## Deploy to Azure SWA

Add these Application Settings in Azure Portal → your SWA → Configuration:

| Key | Value |
|---|---|
| COSMOS_ENDPOINT | https://YOUR_ACCOUNT.documents.azure.com:443/ |
| COSMOS_KEY | your primary key |
| COSMOS_DB_NAME | wa-hiking |
| COSMOS_CONTAINER | trails |
| SYNC_SECRET_TOKEN | random secret (openssl rand -hex 32) |
| WSDOT_ACCESS_CODE | free key from wsdot.wa.gov/traffic/api |
| GITHUB_TOKEN | PAT with repo scope |
| GITHUB_OWNER | your github username |
| GITHUB_REPO | wa-hiking-app |
| GITHUB_LABELS | feedback,from-app |

Add these GitHub Actions secrets (repo → Settings → Secrets):

| Key | Value |
|---|---|
| SWA_API_URL | https://your-app.azurestaticapps.net |
| SYNC_SECRET_TOKEN | same as above |

Then run: **GitHub → Actions → Sync Trail Data → Run workflow → all**

After that, syncs run automatically: trail data weekly, conditions every 6h.

## Data sources (all 100% free)

| Source | Data | Auth |
|---|---|---|
| OpenStreetMap Overpass | 3000+ WA trails, road surfaces near trailheads | None |
| WA DNR GIS REST API | Official WA trails, forest road maintenance levels 1-5 | None |
| WA State Parks Socrata | State park trails, Discover Pass info | None |
| NOAA Weather API | Snow level, rain, temperature by region | None |
| WSDOT Pass Conditions | Mountain pass closures, travel advisories | Free key |
