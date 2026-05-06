# WA Trail Finder

A mobile-first web app for finding Washington State hiking trails.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Full Stack (with /api/feedback)

```bash
npm install -g @azure/static-web-apps-cli
cp .env.example .env.local   # fill in your GitHub secrets
swa start http://localhost:5173 --api-location api
```

## GitHub Secrets Required (for Feedback feature)

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Personal access token with `repo` scope |
| `GITHUB_OWNER` | Your GitHub username |
| `GITHUB_REPO` | Repo name where issues will be created |
| `GITHUB_LABELS` | Comma-separated labels (e.g. `feedback,from-app`) |

## Deploy to Azure Static Web Apps

1. Push this repo to GitHub
2. In the Azure Portal → Create a resource → Static Web App
3. Connect your GitHub repo
4. Build settings: App location `/`, Output location `dist`, API location `api`
5. Add the GitHub secrets above as Application Settings in the Azure portal

## Run Tests

```bash
npx vitest
```

## Type Check

```bash
npm run typecheck
```
