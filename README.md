# STARS — Safety-Aware Navigation

**Smarter travel, safer roads.** STARS is a route-finding application that treats
road safety as a first-class routing concern: it generates multiple routes,
analyzes real conditions along each one (traffic, potholes, weather, incidents,
time of day), scores them, and recommends the safest practical route — with
plain-language reasons why.

Built with React + Vite. Runs entirely in the browser; no backend required.

---

## Features

### Navigation & routing
- Geocoded source/destination search (OpenStreetMap Nominatim) with map picking
- Multiple route alternatives from Mapbox Directions, stops along the way
- Live traffic overlay (driving-traffic profile) with congestion coloring
- Weather sampling along each route (OpenWeather)
- Turn-by-turn step list, route chips on the map, full-screen map mode

### Safety intelligence
- **Safety score (0–100)** per route from weighted factors: traffic, pothole
  exposure, weather, incidents, accidents, and time of day — unavailable
  factors are *excluded*, never guessed
- **Route recommendation** with travel-time tolerance and a "Why this route?"
  list built only from real metric differences
- **Time-aware risk**: weekday rush-hour and weekend late-night modifiers,
  plus a typical safest travel window for the day
- Risk bands: Very Safe / Safe / Moderate / Risky / High Risk

### Incident & hazard awareness
- Route incidents merged from traffic congestion, user reports, and an
  optional external GeoJSON feed (sources are attributed, absence is honest)
- Ahead-of-route **hazard alerts** (warnings capped and throttled)
- Optional **voice guidance**: maneuver announcements and spoken safety
  warnings (off by default, browser speech synthesis)

### Hazard intelligence
- Pothole reports via camera or upload: EXIF GPS → live GPS → OCR coordinate
  fallback, with an assistive detection interface (the shipped detector is a
  rule-based stub that never fabricates AI results)
- Duplicate detection: nearby reports cluster into one map pin
- **Confidence model**: count, verification, photo, location provenance, and
  recency produce a transparent HIGH/MEDIUM/LOW badge
- **Safety heatmap**: weighted density of active hazards (severity × recency)
- **Hotspots**: ranked zones where active hazards concentrate, with fly-to

### Hazard lifecycle & administration
- Canonical lifecycle: `reported → under-review → verified →
  repair-requested → fixed`, plus `rejected` — legacy statuses migrate on load
- Admin worklist: status summary, pending fix-proof/relocation badges,
  status filter tabs, priority sorting (action needed first)
- Fix-proof review, rejection with reason, per-status transitions, BBMP export
- Fixed hazards stay visible on demand but stop affecting safety scores

### Insights
- **Trip history**: every route used is recorded with its safety score;
  arrivals complete trips; capped and persisted locally
- **Safety analytics**: lifecycle breakdown, severity mix, fix rate, 8-week
  report trend, trip aggregates — all derived from stored data only

### UX quality
- On-map controls: zoom, metric scale bar, layer toggles (heatmap, fixed
  potholes, BBMP, congestion)
- Responsive from small phones to wide desktops
- Accessibility: skip link, labeled inputs, dialog semantics, visible focus,
  `prefers-reduced-motion` support
- API resilience: request timeouts, bounded retries with backoff, short TTL
  caching (Nominatim-friendly)

---

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 18, JSX |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 |
| Maps | Mapbox GL JS |
| Charts | Recharts |
| Icons | lucide-react |
| Photo intelligence | exifr (EXIF), tesseract.js (OCR) |

No other runtime dependencies are used.

---

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your keys
npm run dev            # http://localhost:5173
```

Production build and preview:

```bash
npm run build
npm run preview
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_MAPBOX_TOKEN` | yes | Map tiles + Directions API (routing, traffic) |
| `VITE_OPENWEATHER_KEY` | optional | Weather factor along routes |
| `VITE_INCIDENTS_URL` | optional | External incident feed (GeoJSON). When unset, incident/accident factors are reported as unavailable instead of guessed |

---

## Architecture

```
src/
├── App.jsx                 # main application (composition + map wiring)
├── components/             # presentational panels (alerts, hotspots,
│   │                       #   trips, analytics, layer popover)
├── hooks/
│   ├── useHazardAlerts.js  # ahead-of-route alert projection/throttling
│   └── useTripHistory.js   # trip start/end/arrival recording + persistence
├── services/
│   ├── incidentService.js  # incident merging + external feed client
│   ├── voiceNavigation.js  # speech synthesis, dedupe, phrasing
│   ├── potholeDetection.js # photo → EXIF/OCR/geolocation + detector iface
│   └── httpClient.js       # timeout/retry/backoff/TTL cache
└── utils/                  # pure, unit-tested logic
    ├── safetyScore.js      # factor risks, weights, bands, time profiles
    ├── routeAnalysis.js    # per-route analysis records
    ├── recommendation.js   # safest-practical choice + reasons
    ├── geo.js              # polyline projection/distance helpers
    ├── clustering.js       # duplicate-report clustering
    ├── confidence.js       # transparent confidence scoring
    ├── hazardLifecycle.js  # statuses, transitions, labels, queue order
    ├── hazardAlerts.js     # deterministic alert evaluation
    ├── hotspots.js         # hotspot zone detection + ranking
    ├── heatmap.js          # heatmap weights + GeoJSON builder
    ├── analytics.js        # report/trip aggregation + weekly trend
    └── tripHistory.js      # trip records, persistence, summaries
```

### Safety model

- Each factor returns a 0–100 risk or `null` (unavailable). The score is a
  weighted average **over available factors only**, so missing data never
  inflates or penalizes a route; unavailable factors are listed explicitly.
- Weights live in `safetyScore.js` (`DEFAULT_WEIGHTS`) and are renormalized
  at scoring time.
- Only *active* hazards influence scoring and the heatmap; `fixed` and
  `rejected` reports are display-only (admin "show fixed" keeps them visible).

### Data & privacy

Everything is stored **locally in your browser** (`localStorage`): reports,
trips, admin messages, and preferences. Nothing is uploaded to a server.
Clearing site data resets the app. Central/multi-user persistence would
require adding a backend.

Key names: `userPotholeReports`, `tripHistory`, `adminMessages`,
`voiceNavigationEnabled`, `voiceSafetyEnabled`, `showOnlyUnverified`.

---

## Verification

- Pure logic (`src/utils`, `src/services`) is exercised with Node assertion
  suites, including a full cross-module workflow scenario: report →
  clustering → confidence → hotspot → heatmap → analytics → route analysis →
  recommendation → trip lifecycle → resolution.
- `npm run build` passes for every change.
- Browser verification covers app mount, console cleanliness, and the
  interactive panels (hotspots, trips, analytics, layer toggles).

## Security notice

`.env` was previously committed, so **any Mapbox/OpenWeather token that ever
lived in this repository must be treated as compromised**: rotate it in the
provider dashboard and put the fresh key in `.env` (git-ignored). The
credential-free `.env.example` is the only env template tracked by git.

## Known limitations

- The pothole detector ships as a rule-based stub behind a real interface;
  plug in a trained model via `registerPotholeDetector()` (results are only
  trusted when the detector declares `kind: "ai"`).
- OCR coordinate extraction is heuristic — EXIF and live GPS are preferred.
- External APIs (Nominatim, Mapbox, OpenWeather, Overpass, BBMP dataset)
  need network access and, where listed above, valid keys.
