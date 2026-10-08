# STARS — Intelligent Road Safety Decision Support System

**Smarter travel, safer roads.** STARS is a route-finding application that treats
road safety as a first-class routing concern: it generates multiple routes,
analyzes real conditions along each one (traffic, potholes, weather, incidents,
road condition, time of day), scores them with an explainable model, and
recommends the safest practical route — with plain-language reasons why.

Built with React + Vite. Runs entirely in the browser; no backend required.

---

## 1. Project Overview

STARS answers a simple question: *given two points, which way should I go to be
safe?* It combines map routing with a transparent safety-scoring engine and
crowdsourced hazard intelligence:

- **Multiple route alternatives** from Mapbox Directions, analyzed independently.
- **A 0–100 safety score per route** derived from weighted, real factors —
  unavailable factors are excluded, never guessed.
- **Crowdsourced hazard reports** (potholes, waterlogging, debris, closures…)
  with clustering, confidence scoring, and a full admin review lifecycle.
- **Evidence everywhere**: every score, badge, and recommendation shows which
  factors produced it, how many were available, and how confident the system is.

Everything runs client-side. Optional keys unlock weather and external incident
feeds; without them the app degrades honestly instead of inventing data.

## 2. Key Features

- **Navigation**: geocoded source/destination search, map picking, mid-route
  stops, turn-by-turn steps, full-screen map, live traffic coloring.
- **Safety intelligence**: weighted safety scores, risk bands, route
  recommendation with a "Why this route?" list, per-factor confidence and
  evidence-coverage indicators.
- **Prediction**: 15/30/60-minute forward risk estimates and what-if scenario
  comparison, both rule-based and clearly labeled as estimates.
- **Hazard intelligence**: photo → EXIF/OCR coordinate reporting, duplicate
  clustering, safety heatmap, ranked hotspot zones, ahead-of-route alerts.
- **Admin & municipal tools**: verification worklist, fix-proof review,
  rejection reasons, repair-priority ranking, road-change detection, municipal
  summary dashboard.
- **Condition modes**: night safety, waterlogging/flood risk, road-health
  index, emergency-services lookup.
- **Trips & analytics**: automatic trip recording with safety scores, trip
  history panel, aggregate safety analytics derived only from stored data.
- **Quality**: responsive layout, screen-reader announcements, keyboard Escape
  handling, error boundary, bounded network retries, tree-shaken lazy chunks.

## 3. System Architecture

STARS is a single-page React application with a layered, feature-oriented
architecture:

```
UI layer          App.jsx (composition, map wiring, state)
                  └── src/features/*  (panels + pure logic per domain)
Data layer        src/services/*      (HTTP client, incident feed, hazard
                  repository, voice, photo intelligence)
Persistence       browser localStorage (swap-ready repository abstraction,
                  optional HTTP backend via VITE_API_BASE_URL)
External APIs     Mapbox (tiles/directions), OpenWeather, Nominatim,
                  optional GeoJSON incident feed, Overpass (emergency)
```

Key principles, enforced by tests:

- **Pure logic lives in `features/` modules** — scoring, analysis, clustering,
  ranking — and is exercised by Node assertion suites without a browser.
- **Honesty over hallucination**: a missing factor becomes `null`, is excluded
  from weighted averages, and is reported as unavailable in the UI.
- **All network access goes through one resilient client** (`httpClient.js`)
  with timeouts, bounded retries, and a short TTL cache.

## 4. Technology Stack

| Layer | Choice |
| --- | --- |
| UI | React 18, JSX |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 |
| Maps | Mapbox GL JS |
| Charts | Recharts (lazy-loaded) |
| Icons | lucide-react |
| Photo intelligence | exifr (EXIF), tesseract.js (OCR) |

No other runtime dependencies are used.

## 5. Project Structure

```
src/
├── App.jsx                   # main application (composition + map wiring)
├── main.jsx                  # entry; wraps <App/> in an ErrorBoundary
├── components/
│   └── ErrorBoundary.jsx     # app-shell crash fallback (retry / reload)
├── features/                 # feature folders: logic + its panels together
│   ├── routing/              # geo, route analysis/preferences, segments,
│   │                         #   recommendation, what-if + 4 panels
│   ├── safety/               # safety score, prediction, confidence,
│   │                         #   explainability, hotspots, heatmap, alerts
│   │                         #   + 4 components
│   ├── road-conditions/      # waterlogging, night safety, road health,
│   │                         #   change detection + 4 panels
│   ├── community/            # crowdsourcing, trip history, analytics
│   │                         #   + Trips/Analytics panels
│   ├── admin/                # hazard lifecycle, repair priority,
│   │                         #   municipal summary + 2 panels
│   ├── emergency/            # emergency mode/services + panel
│   └── map/                  # layer control groups + layers popover
├── hooks/                    # useHazardAlerts, useTripHistory
├── services/                 # httpClient, backend repository, incident
│                             #   service, hazard service, voice, detection
└── assets/                   # icons (SVG markers)
tests/                        # regression suites t21–t29 + npm test runner
docs/                         # architecture baseline notes
```

## 6. Getting Started

Prerequisites: **Node.js 18+** and npm.

```bash
npm install
cp .env.example .env   # then fill in your keys (see Environment Variables)
npm run dev            # http://localhost:5173
```

## 7. Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_MAPBOX_TOKEN` | yes | Map tiles + Directions API (routing, traffic) |
| `VITE_OPENWEATHER_KEY` | optional | Weather factor along routes and forecasts |
| `VITE_INCIDENTS_URL` | optional | External incident feed (GeoJSON). When unset, incident/accident factors are reported as unavailable instead of guessed |
| `VITE_OVERPASS_URL` | optional | Overpass endpoint for nearby emergency services (defaults to the public API) |
| `VITE_API_BASE_URL` | optional | HTTP backend for multi-user persistence. When unset, all data stays in localStorage |

> **Security note:** API keys for Mapbox and OpenWeather were previously
> committed to this repository's history. Any token that ever lived in git must
> be treated as compromised — rotate it in the provider dashboard and put the
> fresh key in `.env` (git-ignored). Only the credential-free `.env.example`
> is tracked by git.

## 8. Running & Building

```bash
npm run dev       # development server with HMR (http://localhost:5173)
npm run build     # production bundle into dist/
npm run preview   # serve the production bundle locally
```

The build splits heavy vendors into cached chunks (`vendor-mapbox`,
`vendor-react`, `vendor-charts`, `vendor-ocr`); the chart library and three
heavy panels load only when opened.

## 9. Testing & Verification

```bash
npm test          # runs every suite in tests/ (dependency-free runner)
```

- **Suites t21–t26** cover pure logic end-to-end: trip analytics, backend
  repository, hazard services, crowdsourcing, confidence/evidence, and map
  control groups — including a full workflow scenario (report → clustering →
  confidence → hotspot → heatmap → analytics → route analysis →
  recommendation → trip lifecycle → resolution). Because app modules use
  Vite-style extensionless imports, the runner mirrors `src/` into a temp
  harness before running them under plain Node.
- **Suite t27** asserts the production bundle graph (vendor chunking, lazy
  chart loading, memoized panels, stable handlers).
- **Suites t28–t29** assert error-handling guards (error boundary wiring, no
  unguarded promise chains) and accessibility/responsive invariants (Escape
  handling, live regions, busy state, layout breakpoints).
- `npm run build` passes for every change, and browser verification covers
  app mount, console cleanliness, route search, and the interactive panels.

## 10. Safety Scoring Engine

The scoring engine (`features/safety/safetyScore.js`) is the core of the
system:

- Seven weighted factors: **traffic (0.22), pothole exposure (0.26), weather
  (0.16), incidents (0.12), accidents (0.14), time of day (0.10), road
  condition (0.14)**. Weights are renormalized at scoring time so they always
  sum to 1 over the factors actually used.
- Each factor returns a 0–100 risk or `null`. The score is a weighted average
  **over available factors only** — missing data never inflates or penalizes a
  route.
- **Confidence & evidence**: `assessFactorConfidence()` bands the result
  (Insufficient / Low / Medium / High), caps coverage-poor results, marks
  estimated inputs with ⚠, and reports an evidence-coverage percentage. The UI
  surfaces this next to every score ("Confidence: Medium (5/7 factors)",
  "Evidence base: N stored reports").
- Time-aware modifiers cover weekday rush hour and weekend late nights, and the
  engine suggests the safest travel window for the day.
- Risk bands: Very Safe / Safe / Moderate / Risky / High Risk.
- Only *active* hazards influence scoring; `fixed` and `rejected` reports are
  display-only.

## 11. Route Intelligence & Recommendation

- `analyzeRoute()` produces a per-route record: safety score, segment-level
  risk strip, traffic/congestion state, weather samples, incident list, and
  the factor breakdown behind the score.
- `recommendRoute()` picks the safest practical alternative within a
  travel-time tolerance and builds a "Why this route?" list **only from real
  metric differences** between the candidates.
- Route preferences (avoid ferries/tolls/unpaved, etc.) map to Mapbox
  `exclude` parameters with graceful degradation: if the profile rejects the
  exclusion, routes are re-fetched without it and the user is told.
- Live traffic and pothole proximity are pulled per alternative so every
  route gets the same depth of analysis.

## 12. Predictive & Explainable Safety

- **Forward risk estimates** at 15, 30, and 60 minutes blend current
  conditions, the historical hour profile, and (when available) forecast
  weather — clearly labeled *Predictive estimate*, with missing inputs
  excluded rather than guessed.
- **What-if mode** re-runs the analysis under changed conditions (e.g. worse
  weather, different time) and shows before/after deltas.
- **Explanation cards** (`explainability.js`) describe, in plain language, how
  a score or prediction was produced — which factors moved it, which engine
  produced the result, and what evidence backs it. Nothing is presented as an
  opaque AI verdict: the shipped prediction is a transparent rule-based model
  and says so.

## 13. Hazard Reporting & Crowdsourcing

- Report potholes, broken roads, waterlogging, fallen trees, debris, damaged
  dividers, signal problems, construction, closures, poor visibility, and
  other hazards — optionally with a photo.
- **Coordinate provenance**: photo EXIF GPS → live GPS fallback → OCR
  extraction, with a transparent confidence badge (count, verification, photo,
  location provenance, recency) and an assistive detection interface. The
  shipped detector is a rule-based stub that never fabricates AI results;
  trained models plug in via `registerPotholeDetector()`.
- **Duplicate clustering**: nearby reports merge into one pin with an
  evidence line (N reports in zone, M active).
- **Multi-user ready**: the data layer is a repository abstraction
  (`backend.js`) with `local` and `http` kinds — set `VITE_API_BASE_URL` to
  share reports across users, or stay fully local. Admin↔user messaging
  (admin notes, delete/fix requests) works either way.
- Distance-from-route filtering keeps alerts relevant: hazards are matched to
  each route within a threshold and surfaced ahead of your position.

## 14. Hazard Lifecycle & Admin Console

- Canonical lifecycle: `reported → under-review → verified →
  repair-requested → fixed`, plus `rejected` — legacy statuses migrate on
  load, and transitions are validated (illegal jumps are rejected).
- **Admin console** (PIN-gated, default `1234` — change it before real use):
  worklist with status summary and filter tabs, fix-proof photo review,
  rejection with reason, per-status transitions, priority sorting, and an
  undo window on deletions.
- **Municipal dashboard**: aggregates stored reports into repair priority
  bands, road-health grades, change-detection diffs against daily baselines,
  and a summary of what needs attention.
- Fixed hazards stay visible on demand but stop affecting safety scores and
  the heatmap.

## 15. Emergency & Road-Condition Modes

- **Emergency mode**: one tap to find nearby hospitals/police/fire stations
  (Overpass/OSM) and call-friendly contacts, with route context attached.
- **Night safety**: darkness-aware risk using time-of-day profiles and
  lighting-related factors, with a safest-window suggestion.
- **Waterlogging / flood**: rainfall-aware standing-water risk along the route
  (uses the weather factor when a key is configured).
- **Road health**: a composite index (0–100) with letter grades from stored
  reports and change history.
- All condition panels follow the same honesty rule: when inputs are missing
  they say *insufficient data* instead of rendering a made-up number.

## 16. Voice, Alerts & Notifications

- **Voice guidance** (off by default): maneuver announcements and spoken
  safety warnings via browser speech synthesis, deduplicated per hazard.
- **Hazard alert stack**: ahead-of-route warnings projected onto your
  position, capped and throttled, announced through an `aria-live="assertive"`
  region.
- **Browser notifications** for nearby user-reported hazards (permission
  requested in context; failures are swallowed, never thrown).
- **Admin messages**: in-app inbox for review outcomes, deletion requests,
  and fix proofs, with an unread badge.

## 17. Data & Privacy

Everything is stored **locally in your browser** (`localStorage`). Nothing is
uploaded anywhere unless you explicitly configure `VITE_API_BASE_URL`.
Clearing site data resets the app.

| Key | Contents |
| --- | --- |
| `userPotholeReports` | hazard reports (photos stored inline) |
| `tripHistory` | completed trips with safety scores |
| `adminMessages` | admin↔user messages and review outcomes |
| `roadChangeSnapshots` | daily road-change baselines |
| `routePreferences` | routing avoidance preferences |
| `starsUsers`, `starsPredictions` | multi-user / prediction caches (when enabled) |
| `showFixed`, `showOnlyUnverified` | admin view toggles |
| `voiceNavigationEnabled`, `voiceSafetyEnabled` | voice settings |

All reads are defensive: corrupt or missing JSON falls back to safe defaults
rather than crashing the app.

## 18. Performance & Resilience

- **Chunked builds**: heavy vendors split into cacheable chunks; the chart
  library (Recharts) and three heavy panels (Analytics, Predictive, Traffic
  chart) are `React.lazy` — the initial bundle never pays for them.
- **Memoization**: heavy panels are wrapped in `React.memo`, hot-path
  handlers are `useCallback`-stable, and expensive derivations are `useMemo`ed.
- **One resilient HTTP client**: every request has a timeout, bounded retries
  (server errors and network only — never 4xx), exponential backoff, and a
  short TTL cache that is Nominatim-friendly.
- **Error boundary**: any render crash shows a friendly fallback with
  *Try again* / *Reload app* instead of a blank page.
- **Guarded promises**: every async chain in the app resolves to a safe
  fallback (no unhandled rejections), and the route-error banner clears on the
  next attempt.

## 19. Accessibility & Responsiveness

- Skip-to-content link, visible `:focus-visible` outlines, labeled inputs,
  dialog semantics (`role="dialog"`, `aria-modal`), and grouped map-layer
  controls with `role="group"` labels.
- **Screen-reader announcements**: a polite live region narrates route search
  progress and results ("Finding routes…" → "2 routes found"); the notice
  banner is `role="status"` and errors are `role="alert"`.
- **Keyboard**: `Escape` closes the topmost dialog/popover or cancels map
  picking; the Find Routes button exposes `aria-busy` while searching.
- **Motion**: `prefers-reduced-motion` disables animations.
- **Responsive**: single-column layout on phones with zero horizontal
  overflow; the map canvas re-syncs its size on viewport resize/rotation.

## 20. Troubleshooting & Known Limitations

**Troubleshooting**

- *Blank map*: check that `VITE_MAPBOX_TOKEN` is set in `.env` and restart
  the dev server.
- *Weather factor missing*: `VITE_OPENWEATHER_KEY` unset or over quota — the
  score will show weather as unavailable rather than guessing.
- *No routes found*: verify both points are on/near drivable roads; route
  exclusions in Preferences are retried automatically, but very remote pairs
  can genuinely have no route.
- *Stale data after a big change*: clear site data — all state is local.

**Known limitations**

- The pothole detector ships as a rule-based stub behind a real interface;
  plug in a trained model via `registerPotholeDetector()` (results are only
  trusted when the detector declares `kind: "ai"`).
- OCR coordinate extraction is heuristic — EXIF and live GPS are preferred.
- External APIs (Nominatim, Mapbox, OpenWeather, Overpass, optional incident
  feed) need network access and, where listed, valid keys.
- Multi-user sharing requires you to host your own backend
  (`VITE_API_BASE_URL`); none is bundled.

## 21. Team & Credits

**Team:** Deepak R · Yashaswini M

Built with React, Vite, Tailwind CSS, Mapbox GL JS, Recharts, lucide-react,
exifr, and tesseract.js. Map data © OpenStreetMap contributors; geocoding by
Nominatim; emergency listings via Overpass API.

*Smarter travel, safer roads.*
