# STARS — Smart Traffic and Road Safety Assistant

**Smarter travel, safer roads.** STARS is an AI/ML-ready road-safety navigation
and infrastructure-intelligence platform: it generates multiple routes,
analyzes real conditions along each one (traffic, potholes, weather,
incidents, road condition, time of day), scores them with an explainable
model, and recommends the safest practical route — with plain-language
reasons why.

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
- **Infrastructure intelligence**: road-health indexing, change detection,
  municipal repair-priority ranking, and a municipal dashboard built from the
  same stored reports.
- **Evidence everywhere**: every score, badge, and recommendation shows which
  factors produced it, how many were available, and how confident the system is.

Everything runs client-side. Optional keys unlock weather and external incident
feeds; without them the app degrades honestly instead of inventing data.

## 2. Problem Statement

Road-safety decisions are usually made on time alone: navigation apps optimize
for the fastest or shortest path, while the actual condition of the road —
potholes, waterlogging, accidents, poor lighting, unverified hazards — is left
to the driver's local knowledge. At the same time, municipal authorities lack a
consolidated, evidence-based view of where road problems are concentrated, so
repairs are prioritized by anecdote rather than by data.

The result is a double gap: travelers cannot ask *"which route is safer, and
how much longer will it take?"*, and authorities cannot ask *"which roads
should we fix first?"* — even though both answers should be derivable from the
same hazard data.

## 3. Objectives

1. Turn STARS from a simple navigation app into an **intelligent road-safety
   decision-support system** that answers which route is safer, how much longer
   it takes, and why it is recommended.
2. Score routes with a **centralized, explainable safety engine** whose weights
   are configurable and whose inputs are never fabricated when data is missing.
3. Add **predictive (rule-based) risk estimates** for the next 15–60 minutes,
   clearly labeled as estimates rather than AI predictions.
4. Build **crowdsourced hazard intelligence** — reporting, clustering,
   verification lifecycle, and confidence — that improves with more users while
   never auto-verifying crowdsourced data.
5. Provide **infrastructure-facing analytics**: road-health index, condition
   change detection, repair priority, and a municipal dashboard.
6. Keep the architecture **modular** (UI / navigation / analysis / safety /
   prediction / storage / API layers) so a real ML model or backend can be
   plugged in later without rewrites.
7. Preserve everything that already worked: Mapbox navigation, weather,
   traffic, pothole reporting, route comparison, admin moderation.

## 4. Key Features

- **Navigation**: geocoded source/destination search, map picking, mid-route
  stops, turn-by-turn steps, full-screen map, live traffic coloring.
- **Safety intelligence**: weighted safety scores, risk bands, multi-route
  comparison table, safety-vs-time optimization modes, route recommendation
  with a "Why this route?" list, per-factor confidence and evidence coverage.
- **Prediction**: 15/30/60-minute forward risk estimates (rule-based,
  labeled *Predictive estimate*) and what-if scenario comparison (labeled
  *Scenario Simulation*).
- **Segment & infrastructure risk**: per-segment risk strip and map layer,
  road-health index, road-condition change detection, repair-priority ranking,
  municipal dashboard with filters.
- **Hazard intelligence**: photo → EXIF/OCR coordinate reporting, duplicate
  clustering, safety heatmap, ranked hotspot zones, ahead-of-route alerts,
  multi-user aggregation through a repository abstraction.
- **Admin & municipal tools**: verification worklist, fix-proof review,
  rejection reasons with messaging, status lifecycle, priority sorting.
- **Condition modes**: night safety, waterlogging/flood risk, emergency mode,
  nearby emergency-services lookup.
- **Trips & analytics**: automatic trip recording with safety scores, trip
  history panel, aggregate safety analytics derived only from stored data.
- **Quality**: responsive layout, screen-reader announcements, keyboard Escape
  handling, app-level error boundary, bounded network retries, tree-shaken
  lazy chunks.

## 5. System Architecture

STARS is a single-page React application with a layered, feature-oriented
architecture:

```
UI layer          src/app/App.jsx (composition, map wiring, state)
                  ├── src/app/sections/SectionViews.jsx (six-section shell)
                  └── src/features/*  (panels + pure logic per domain)
Data layer        src/services/*      (HTTP client, incident feed, hazard
                  repository, voice, photo intelligence)
Persistence       browser localStorage (swap-ready repository abstraction,
                  optional HTTP backend via VITE_API_BASE_URL)
External APIs     Mapbox (tiles/directions), OpenWeather, Nominatim,
                  optional GeoJSON incident feed, Overpass (emergency)
```

The interface is organized into seven sections; every panel lives in exactly one.
Section keys double as URL hash segments (`#/navigate`, `#/safety`, …), so a
section is linkable and route state survives switching (the map stays mounted):

```
Navigate          map, search, routes, comparison, recommendation, hazards
Safety            route score, factors, confidence, prediction, segment risk
Hazards           reported-hazard listing + unified form (type, evidence,
                  location, severity, review status)
Environment       traffic, weather and data-source availability for the route
Analytics         trip history + trip safety analytics
Road Intelligence road health, hotspots, changes, repair priority; Municipal (admin)
Tools             route preferences, map/display controls, voice settings
```

Feature folders pair each domain's pure logic with its panels:

```
src/features/routing/         route analysis, preferences, segments,
                              recommendation, what-if
src/features/safety/          safety score, prediction, confidence,
                              explainability, hotspots, heatmap, alerts
src/features/road-conditions/ waterlogging, night safety, road health,
                              change detection
src/features/community/       crowdsourcing, trip history, analytics
src/features/admin/           hazard lifecycle, repair priority,
                              municipal summary
src/features/emergency/       emergency mode + services
src/features/map/             layer control groups + layers popover
```

Key principles, enforced by tests:

- **Pure logic lives in `features/` modules** — scoring, analysis, clustering,
  ranking — and is exercised by Node assertion suites without a browser.
- **Honesty over hallucination**: a missing factor becomes `null`, is excluded
  from weighted averages, and is reported as unavailable in the UI.
- **All network access goes through one resilient client** (`httpClient.js`)
  with timeouts, bounded retries, and a short TTL cache.

## 6. Technology Stack

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

## 7. Safety Scoring

The scoring engine (`features/safety/safetyScore.js`) is the core of the
system:

- Seven weighted factors: **traffic (0.22), pothole exposure (0.26), weather
  (0.16), incidents (0.12), accidents (0.14), time of day (0.10), road
  condition (0.14)**. Weights are configurable and renormalized at scoring time
  so they always sum to 1 over the factors actually used.
- Each factor returns a 0–100 risk or `null`. The score is a weighted average
  **over available factors only** — missing data never inflates or penalizes a
  route.
- **Bands**: 90–100 Very Safe · 75–89 Safe · 60–74 Moderate · 40–59 Risky ·
  0–39 High Risk.
- **Confidence & evidence**: `assessFactorConfidence()` bands the result
  (Insufficient / Low / Medium / High), caps coverage-poor results, marks
  estimated inputs with ⚠, and reports an evidence-coverage percentage. The UI
  surfaces this next to every score ("Confidence: Medium (5/7 factors)",
  "Evidence base: N stored reports"). Score and confidence are always shown as
  two different concepts.
- Time-aware modifiers cover weekday rush hour and weekend late nights, and the
  engine suggests the safest travel window for the day.
- Only *active* hazards influence scoring; `fixed` and `rejected` reports are
  display-only.

## 8. Incident Intelligence

- Structured incident types: congestion, accident, hazard, construction,
  closure, lane restriction, and other — normalized from the external feed.
- Per-incident **severity, recency, distance from route, and route impact**
  feed an incident-risk factor in the safety engine; accident risk is tracked
  separately so "accidents" never double-count generic incidents.
- When no incident feed is configured (`VITE_INCIDENTS_URL` unset), the
  incident and accident factors are reported as **unavailable and excluded**
  from the weighted score — the app never fabricates accident statistics.
- Live congestion overlay on the map derives from the same traffic source used
  for routing, and route-level traffic falls back to a step-speed estimate
  (marked *estimated*, which caps confidence at Medium).

## 9. Predictive Safety

- **Forward risk estimates at 15, 30, and 60 minutes** blend current
  conditions, the time-of-day profile at the target hour, and (when available)
  forecast weather — with missing inputs excluded rather than guessed.
- Every result is labeled **Predictive estimate** and carries a confidence
  band with evidence reasons ("✓ Weather forecast applied", "⚠ No historical
  data for this location").
- **Rule-based, not ML**: the shipped prediction engine is a transparent
  deterministic model. It does not claim AI/ML inference; a real model can be
  integrated later behind the same interface.
- **Explanation cards** (`explainability.js`) describe, in plain language, how
  a score or prediction was produced — which factors moved it and what
  evidence backs it — using real engine weights and contributions, never
  invented feature-importance percentages.
- The Predictive Safety panel shows current vs 15/30/60-minute estimates with
  score, risk level, confidence, and contributing factors.

## 10. AI Pothole Detection

- An extensible detector interface: `registerPotholeDetector()` accepts any
  detector (YOLO, ONNX Runtime, TensorFlow.js, or a remote inference API) that
  follows the `detectPotholes(image)` contract and returns structured
  detections (bounding box, confidence, severity).
- **The app ships no trained model.** The bundled detector is an explicit
  rule-based stub that always returns `available: false` with zero
  detections — it never fabricates a detection, and results are only trusted
  when a detector declares `kind: "ai"`.
- The image workflow is independent of the model: photo → validation → EXIF
  GPS extraction → (optional) detector → OCR coordinate fallback → manual
  confirmation → severity → confidence → report.
- **Location confidence and detection confidence are separate dimensions**,
  each shown with its own badge (GPS/EXIF High, OCR/map-pick Medium, none Low).
- Manual reporting always remains available when no model is configured.

## 11. Road Segment Risk

- Route geometry is split into contiguous segments (~500 m target, 4–12 per
  route), each scored from hazards, incidents, weather samples, congestion and
  route traffic within its corridor.
- Each segment gets a 0–100 score and a band — **Safe / Moderate / Risky /
  High Risk** — shown as a risk strip under the route cards and clickable for
  detail.
- The **Road Risk map layer** draws segments in their band colors and can be
  toggled alongside Traffic, Weather, Potholes, Incidents, Hazard markers and
  the Safety heatmap from the grouped map-layers control.
- A `null`/unknown segment score falls back to the worst band rather than an
  optimistic guess.

## 12. Road Health Index

- A long-term 0–100 index per stored-report area derived from pothole density,
  verified hazards, repeated reports, repair status and road-condition reports
  — separate from short-term navigation safety.
- **Bands**: Good (80+) · Fair (60+) · Poor (40+) · Critical (0+), plus
  *Insufficient Data* when there is no usable evidence — an empty database
  never yields "perfect roads".
- **Change detection** compares the live report database with stored daily
  baselines and classifies conditions as improving / stable / deteriorating,
  with an insufficient-history guard (a baseline younger than one hour is not
  history). Missing report IDs fall back to count-based deltas and say so.
- The comparison is labeled **Report-based comparison** everywhere it appears.

## 13. Municipal Intelligence

- **Repair-priority engine**: ranks hazards from severity, verified report
  count, road health, recurrence, age and waterlogging exposure into
  **Urgent / High / Medium / Low** bands with human-readable reasons — labeled
  *Report-based priority* and never presented as official statistics.
- **Municipal dashboard** (admin-only) aggregates the stored reports into: KPI
  cards, active hazards by type, lifecycle queue, top repair priorities,
  critical roads, road-condition change, road health, waterlogging/pothole/
  verified/recently-fixed counts, and a trend summary.
- **Filters**: date, severity, hazard type, status, priority, and location
  (coordinate-grid areas derived from stored reports — no invented place
  names). All KPIs and sections reflect the same filtered set.
- The dashboard is permanently labeled **Report-based summary** — it is not
  connected to any municipal system, not official statistics, and not a
  prediction.

## 14. Waterlogging Risk

- Rainfall-driven standing-water risk along the route: 0 mm → 0, ≤2.5 mm →
  light, ≤10 mm → moderate, ≤30 mm → heavy, >30 mm → extreme (cloudburst-level),
  banded **Low / Moderate / High / Severe**.
- Inputs are whatever is genuinely available: current weather along the route,
  forecast rainfall when an OpenWeather key is configured, and stored
  waterlogging reports near the route (fixed reports excluded — they no longer
  pose a risk).
- Labeled **Predictive estimate**; with no rainfall data the panel says
  insufficient data rather than inventing a flood forecast. Confirmed
  waterlogging reports are shown separately from predicted risk.

## 15. What-if Simulation

- Scenario modes: all active hazards, high & critical only, potholes only,
  waterlogging only, other road conditions — plus traffic/weather adjustments
  in the simulation panel.
- The simulation recomputes road health and route safety **before vs after**
  the hypothetical repairs and shows the delta, what would remain, and which
  factors were held unchanged at baseline.
- Every run is labeled **Scenario Simulation** with an explicit warning that
  it is hypothetical only — not an achieved or scheduled improvement, and not
  live forecasting.

## 16. Personalized Routing

- Three recommendation policies: **Safety First** (70% safety / 30% time),
  **Balanced** (50/50), **Time First** (30% safety / 70% time). Switching the
  mode re-ranks the recommendation while keeping every alternative visible.
- Optional avoidance preferences (unpaved roads, tolls) map to Mapbox
  `exclude` parameters with graceful degradation: if the profile rejects the
  exclusion, routes are re-fetched without it and the user is told.
- Preferences persist in `localStorage`; invalid stored values fall back to
  Balanced defaults instead of breaking the app.

## 17. Emergency Mode

- **Emergency mode** prioritizes practical routing: travel time, major
  closures, severe hazards and traffic are emphasized for urgent travel.
- **Nearby emergency services** (hospitals, police, fire stations, fuel
  stations) are looked up from OpenStreetMap via the Overpass API — real
  locations only, with map markers, details and navigation. When Overpass is
  unreachable the panel reports the failure honestly.
- The feature states its limitations plainly: STARS is **not integrated with
  any emergency dispatch system**, and no emergency-service location is ever
  fabricated.

## 18. Installation

Prerequisites: **Node.js 18+** and npm.

```bash
git clone https://github.com/deepak251817-collab/Enhanced-Road-Safety-Navigation
cd Enhanced-Road-Safety-Navigation
npm install
cp .env.example .env   # then fill in your keys (see Environment Variables)
```

## 19. Environment Variables

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

## 20. Running the Application

```bash
npm run dev       # development server with HMR (http://localhost:5173)
npm run build     # production bundle into dist/
npm run preview   # serve the production bundle locally
```

The build splits heavy vendors into cached chunks (`vendor-mapbox`,
`vendor-react`, `vendor-charts`, `vendor-ocr`); the chart library and three
heavy panels load only when opened.

## 21. Testing

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
  handling, live regions, busy state, layout breakpoints, map resize sync).
- **Suites t33–t35** cover security invariants (no secrets, escaped popup
  HTML), the municipal dashboard engine, and a comprehensive 25-test
  workflow sweep across navigation, safety, prediction, hazards,
  intelligence, administration and service-failure resilience.
- `npm run build` passes for every change, and browser verification covers
  app mount, console cleanliness, route search, and the interactive panels.

## 22. Project Structure

```
src/
├── main.jsx                  # entry; wraps <App/> in an ErrorBoundary
├── index.css                 # design tokens + shared .stars-* classes
├── app/
│   ├── App.jsx               # main application (composition + map wiring)
│   └── sections/
│       └── SectionViews.jsx  # six-section interface shell
├── components/
│   └── ErrorBoundary.jsx     # app-shell crash fallback (retry / reload)
├── features/                 # feature folders: logic + its panels together
│   ├── routing/              # geo, route analysis/preferences, segments,
│   │                         #   recommendation, what-if + panels
│   ├── safety/               # safety score, prediction, confidence,
│   │                         #   explainability, hotspots, heatmap, alerts
│   ├── road-conditions/      # waterlogging, night safety, road health,
│   │                         #   change detection + panels
│   ├── community/            # crowdsourcing, trip history, analytics
│   ├── admin/                # hazard lifecycle, repair priority,
│   │                         #   municipal summary + panels
│   ├── emergency/            # emergency mode/services + panel
│   └── map/                  # layer control groups + layers popover
├── hooks/                    # useHazardAlerts, useTripHistory
├── services/                 # httpClient, backend repository, incident
│                             #   service, hazard service, voice, detection
└── assets/                   # icons (SVG markers)
tests/                        # 13 regression suites + npm test runner
docs/                         # audits, plan, design system, phase reports
```

## 23. Limitations

- **No trained ML model ships with the app.** The pothole detector is a
  rule-based stub behind a real interface; plug in a trained model via
  `registerPotholeDetector()` (results are only trusted when the detector
  declares `kind: "ai"`). Predictions are rule-based estimates, not AI output.
- OCR coordinate extraction is heuristic — EXIF and live GPS are preferred.
- External APIs (Nominatim, Mapbox, OpenWeather, Overpass, optional incident
  feed) need network access and, where listed, valid keys; when they fail the
  dependent factor is reported as unavailable.
- Multi-user sharing requires you to host your own backend
  (`VITE_API_BASE_URL`); none is bundled.
- All data is local to the browser; clearing site data resets reports, trips
  and baselines.
- The municipal dashboard aggregates only the reports stored in the browser —
  it is not an official municipal system.
- Historical API keys in git history must be rotated operationally; deleting
  them from the latest commit is not sufficient.

## 24. Future Scope

- **Real ML integration**: train/serve a pothole-damage model behind the
  existing detector interface, and add a learned risk model behind the
  prediction interface — with genuine feature-importance surfaced through the
  explainability layer.
- **Shared backend**: deploy the API-backed repository (users, hazards,
  trips, verifications) so crowdsourced reports aggregate across a city
  instead of one browser.
- **More live data**: official incident feeds, municipal waterlogging
  sensors, and road-work schedules as additional honest factor sources.
- **Segment-level history**: persist per-segment scores over time to feed
  long-term road-health trend analysis beyond daily report baselines.
- **Accessibility depth**: full keyboard map navigation and richer
  screen-reader route walkthroughs.

## 25. Team

**Deepak R**
**Yashaswini M**

Built with React, Vite, Tailwind CSS, Mapbox GL JS, Recharts, lucide-react,
exifr, and tesseract.js. Map data © OpenStreetMap contributors; geocoding by
Nominatim; emergency listings via Overpass API.

*Smarter travel, safer roads.*
