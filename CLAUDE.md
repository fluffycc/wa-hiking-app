# WA Hiking Finder — CLAUDE.md (authoritative project instructions)

> This file is the source of truth for every Claude Code session.
> Always read it fully before making any changes to the codebase.

---

## Purpose

WA-only hiking trail web app (mobile-first) that helps hikers answer:
1. **Can I go today?** — snow / mud / bugs / closures signal
2. **Can I get there?** — trailhead road quality
3. **Will I get fined?** — which parking pass is required
4. **Is it right for me?** — miles / elevation / difficulty / features

---

## Non-Negotiable UX Rules

- **Default landing tab: Map** (never Explore, never Saved)
- **Badge order everywhere: Conditions → Access → Parking** (no exceptions)
- **Filter group order:** Go Today → Get There → Costs/Passes → Effort → Preferences
- **Trail Details section order:**
  1. Today at a glance
  2. Conditions
  3. Access / Road to Trailhead
  4. Parking & Passes ← make this prominent
  5. Basics (miles, elevation, difficulty, route type)
  6. Recent trip reports (placeholder UI, no data yet)
- **Never call GitHub API from the browser.** All feedback goes via `/api/feedback`.

---

## Tech Stack (locked — do not substitute)

| Concern | Choice |
|---|---|
| Bundler | Vite |
| UI framework | React 18 + TypeScript (strict) |
| Styling | Tailwind CSS v3 |
| UI primitives | shadcn/ui |
| Map | **react-leaflet** + Leaflet (NOT MapLibre) |
| Map clustering | leaflet.markercluster |
| State | Zustand |
| Testing | **Vitest** + React Testing Library |
| API (serverless) | Azure Static Web Apps managed Functions (Node/TS) |
| Local dev | SWA CLI (`swa start`) |

---

## Repository Layout

```
/
├── CLAUDE.md                   ← you are here
├── README.md
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── staticwebapp.config.json    ← SWA routing
│
├── api/
│   └── feedback/
│       └── index.ts            ← Azure Function (DO NOT move)
│
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── app/                    ← shell, routing, tab nav
    ├── pages/
    │   ├── MapPage.tsx
    │   ├── ExploreListPage.tsx
    │   └── SavedPage.tsx
    ├── components/
    │   ├── map/                ← TrailMap, TrailPin, BottomSheet
    │   ├── trail/              ← TrailCard, BadgeRow, TrailDetails
    │   ├── filters/            ← QuickFilterChips, FilterSheet
    │   ├── feedback/           ← FeedbackButton, FeedbackModal
    │   └── ui/                 ← shadcn re-exports only
    ├── domain/
    │   ├── types.ts            ← canonical types (see below)
    │   ├── filters.ts          ← pure filter/sort functions
    │   └── scoring.ts          ← trail "go score" logic
    ├── services/
    │   └── feedbackClient.ts   ← posts to /api/feedback
    ├── state/
    │   ├── useTrailStore.ts
    │   ├── useUiStore.ts
    │   └── useSavedStore.ts
    ├── data/
    │   └── trails.sample.json
    └── tests/
        ├── filters.test.ts
        ├── scoring.test.ts
        └── feedbackPayload.test.ts
```

---

## Canonical TypeScript Types (`src/domain/types.ts`)

```ts
export type WARegion =
  | 'Olympic Peninsula'
  | 'North Cascades'
  | 'Central Cascades'
  | 'Snoqualmie Region'
  | 'South Cascades'
  | 'Eastern Washington'
  | 'Puget Sound & Islands'
  | 'Southwest Washington';

export type Difficulty = 'Easy' | 'Moderate' | 'Hard' | 'Strenuous';
export type RouteType = 'Loop' | 'OutAndBack' | 'PointToPoint';
export type LandOwner = 'DNR' | 'WDFW' | 'StateParks' | 'USFS' | 'NPS' | 'County' | 'City' | 'Other';
export type Confidence = 'high' | 'medium' | 'low';

export type ParkingPassType = 'free' | 'discover_pass' | 'nw_forest_pass' | 'national_park_fee' | 'unknown';
export type AccessLevel = 'sedan_ok' | 'rough' | 'high_clearance' | '4x4_only' | 'unknown';
export type ConditionOverall = 'go' | 'caution' | 'avoid' | 'unknown';

export interface Trail {
  id: string;
  name: string;
  region: WARegion;
  lat: number;
  lng: number;
  miles: number;
  elevationGainFt: number;
  difficulty: Difficulty;
  routeType: RouteType;
  landOwner: LandOwner;
  parking: {
    type: ParkingPassType;
    notes?: string;
    confidence: Confidence;
  };
  access: {
    level: AccessLevel;
    notes?: string;
    confidence: Confidence;
  };
  conditions: {
    overall: ConditionOverall;
    snow: 'none' | 'patchy' | 'significant';
    mud: 'dry' | 'some' | 'heavy';
    bugs: 'none' | 'some' | 'bad';
    weatherHint?: string;
    lastUpdatedISO?: string;
    notes: string[];
  };
}

export type FeedbackType = 'bug' | 'feature' | 'data' | 'general';

export interface AppFeedback {
  id: string;
  type: FeedbackType;
  message: string;
  trailId?: string;
  url?: string;
  userAgent?: string;
  createdAt: string; // ISO 8601
}
```

---

## Zustand Store Contracts

### `useTrailStore`
```ts
{
  trails: Trail[];           // all trails from sample JSON
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilters: FilterState;
  setFilter: (key: keyof FilterState, value: unknown) => void;
  clearFilters: () => void;
  filteredTrails: Trail[];   // derived — apply filters + search to trails
}
```

### `useUiStore`
```ts
{
  activeTab: 'map' | 'explore' | 'saved';
  setActiveTab: (tab) => void;
  selectedTrailId: string | null;
  setSelectedTrailId: (id: string | null) => void;
  bottomSheetState: 'hidden' | 'preview' | 'expanded';
  setBottomSheetState: (state) => void;
}
```

### `useSavedStore`
```ts
{
  savedTrailIds: string[];
  toggleSaved: (id: string) => void;
  isSaved: (id: string) => boolean;
  myPasses: { discoverPass: boolean; nwForestPass: boolean };
  setPass: (pass: 'discoverPass' | 'nwForestPass', value: boolean) => void;
}
```

---

## Filter Logic (`src/domain/filters.ts`)

```ts
export interface FilterState {
  // Go Today
  conditionOverall: ConditionOverall | 'any';   // quick chip
  // Get There
  accessLevel: AccessLevel | 'any';             // quick chip
  // Costs / Passes
  parkingType: ParkingPassType | 'any';
  // Effort
  maxMiles: number | null;                      // null = no limit
  maxElevationGainFt: number | null;
  difficulty: Difficulty[];                     // empty = all
  // Preferences
  region: WARegion[];                           // empty = all
  routeType: RouteType[];                       // empty = all
}
```

Filter functions must be **pure** (no side effects) so they can be unit tested.
Default `FilterState`: everything set to `'any'` / `null` / `[]` = show all trails.

---

## Map Pin Colors

| `conditions.overall` | Pin color | Tailwind token |
|---|---|---|
| `go` | Green | `#22c55e` (green-500) |
| `caution` | Amber | `#f59e0b` (amber-400) |
| `avoid` | Red | `#ef4444` (red-500) |
| `unknown` | Gray | `#9ca3af` (gray-400) |

Use SVG circle pins — not the default Leaflet blue teardrop.

---

## Coding Standards

- **TypeScript strict** — `"strict": true` in tsconfig. Zero `any`.
- **Functional components only** — no class components.
- **Named exports** — no default exports except pages and App.
- **File naming** — PascalCase for components (`TrailCard.tsx`), camelCase for hooks/utils.
- **Pure domain logic** — all filter, sort, and scoring functions live in `src/domain/` and have no React imports. Test these with Vitest.
- **No inline styles** — Tailwind classes only.
- **No direct GitHub calls from any file in `src/`** — only `api/` may call GitHub.
- **shadcn/ui** — use for Sheet, Dialog, Toast, Button, Badge, Select. Do not reinvent these.

---

## Pre-Built Files (DO NOT regenerate — copy as-is)

These files are provided and must be used verbatim:

| File | Destination |
|---|---|
| `api_feedback_index.ts` | `api/feedback/index.ts` |
| `data_model.feedback.ts` | merge `AppFeedback` + `FeedbackType` into `src/domain/types.ts` |
| `trails.sample.json` | `src/data/trails.sample.json` |

---

## Feedback → GitHub Issues

### Frontend flow
1. `FeedbackButton` (fixed bottom-right, z-50, always visible above bottom nav)
2. Click → `FeedbackModal` opens (shadcn Dialog)
3. User fills type + message → submit
4. `feedbackClient.ts` POSTs to `/api/feedback`
5. Show spinner → on success show shadcn Toast with link to created issue

### Backend (`api/feedback/index.ts`)
- Azure Static Web Apps HTTP-triggered Function
- Reads: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_LABELS`
- Calls GitHub REST API to create issue
- Returns `{ ok: true, issueUrl: string }`

---

## Local Development

```bash
npm install
npm run dev          # frontend only (no /api)

# Full stack (frontend + Azure Function):
npm install -g @azure/static-web-apps-cli
swa start http://localhost:5173 --api-location api
```

Required `.env.local` for full-stack local dev:
```
GITHUB_TOKEN=your_pat
GITHUB_OWNER=your_github_username
GITHUB_REPO=your_repo_name
GITHUB_LABELS=feedback,from-app   # optional
```

---

## Testing (Vitest)

Run with: `npx vitest`

Required test files:
- `src/tests/filters.test.ts` — test each filter key in `FilterState`
- `src/tests/scoring.test.ts` — test `conditions.overall` scoring edge cases
- `src/tests/feedbackPayload.test.ts` — test that `feedbackClient` builds the correct payload shape

---

## Definition of Done

- [ ] `npm run dev` starts without errors
- [ ] Map tab is the default landing view
- [ ] Pins are colored by `conditions.overall`
- [ ] Bottom sheet opens on pin tap (preview → expanded)
- [ ] Explore tab filters work (at minimum: condition, access, parking, difficulty)
- [ ] Saved tab: toggle favorites, set passes
- [ ] Feedback button visible on all tabs; submitting creates a real GitHub issue
- [ ] Vitest tests pass
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] README documents required GitHub secrets and SWA deploy steps
