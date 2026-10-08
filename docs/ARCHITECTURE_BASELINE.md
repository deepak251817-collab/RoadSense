# STARS V3 — Architecture Baseline (Phase 1 Audit)

> **Historical snapshot.** This document records the codebase as it was at
> Phase 1, before the V3 upgrade — file counts, line numbers, and structure
> below are intentionally point-in-time and do not reflect the current tree
> (now organized into `src/features/` folders; see README §3 and §5).
> Kept as the project's baseline audit record.

Audit of the existing STARS application before beginning the V3 intelligence
upgrade. No functional code was changed in this phase.

## 1. Stack

| Layer | Technology |
|---|---|
| Framework | React 18.3 + Vite 5.4 |
| Styling | Tailwind CSS 3.4 |
| Map | Mapbox GL JS 3.5 |
| Charts | Recharts 2.10 |
| Icons | lucide-react |
| Media | exifr (EXIF GPS), tesseract.js (OCR fallback) |

Dependencies: 7 runtime, 5 dev — all confirmed in use. No unused packages.

## 2. Source inventory (7,008 lines total)

| Area | Files | Lines |
|---|---|---|
| `src/App.jsx` (main app) | 1 | 3,697 |
| `src/utils/` | 11 | 1,596 |
| `src/services/` | 4 | 854 |
| `src/components/` | 5 | 405 |
| `src/hooks/` | 2 | 183 |
| `src/index.css`, `src/main.jsx` | 2 | 58 |

Utilities: safetyScore, geo, routeAnalysis, recommendation, hazardAlerts,
clustering, confidence, hazardLifecycle, heatmap, hotspots, analytics, tripHistory.
Services: httpClient (timeout/retry/cache), incidentService, voiceNavigation,
potholeDetection. Components: HazardAlertStack, HotspotsPanel, TripsPanel,
AnalyticsPanel, MapLayersPopover. Hooks: useHazardAlerts, useTripHistory.

## 3. Data flow

- **Mapbox**: token via `VITE_MAPBOX_TOKEN`; map init at `App.jsx:643`;
  Directions API for routes (line 1056) and traffic (1329–1330);
  GeoJSON sources/layers for routes, congestion, BBMP potholes, safety heatmap.
- **Geocoding**: Nominatim (search + reverse), routed through httpClient.
- **Weather**: OpenWeather (`VITE_OPENWEATHER_KEY`), via httpClient.
- **Incidents**: optional `VITE_INCIDENTS_URL` feed via incidentService.
- **Road data**: Overpass API + OpenCity BBMP Fix My Street dataset.
- **Storage**: localStorage keys — `userPotholeReports`, `adminMessages`,
  `showFixed`, `showOnlyUnverified`, `tripHistory`.
- **Resilience**: every external fetch goes through `httpClient.js`
  (AbortController timeout, exponential-backoff retry, TTL cache).

## 4. Scoring & route logic (reuse targets for V3)

- `safetyScore.js` (290 lines): 0–100 weighted engine, classifications,
  time-of-day risk bands, safest-window calculation.
- `routeAnalysis.js` (212): per-route factor breakdown with `classification`
  {label, color} consumed by App and recommendation UI.
- `recommendation.js` (179): safer-route recommendation with time trade-off.
- `confidence.js` (123): evidence-based confidence levels.
- App.jsx contains **no duplicated scoring math** — it only renders results
  from these utils (verified by grep: classification reads only).

## 5. Findings for V3 planning

1. **`App.jsx` is oversized** (3,697 lines, 53% of codebase; 67 useState,
   27 useEffect) — primary refactor target for Phase 31 feature modules.
2. **No predictive layer, segment-level risk, waterlogging, road health
   index, repair priority, what-if simulation, preferences, emergency mode,
   or emergency-services discovery** — all V3 additions, no conflicts.
3. Scoring is centralized already (good base); V3 must extend
   `safetyScore.js`/`routeAnalysis.js` rather than add parallel engines.
4. **Hardcoded demo values**: admin PIN `1234` (App.jsx:2440), hotspot
   threshold 150 m, severity weights — must be flagged as demo/config.
5. **No backend**: all state is localStorage; multi-user phases (23–24)
   will require the controlled backend introduction allowed by Rule 15.
6. No TODO/FIXME/debug logging in src; no `console.log` (error/warn only).
7. Map layers are added imperatively in App.jsx effects — new V3 layers
   (road risk, road health, waterlogging) must follow the same
   insert-below-route pattern to keep z-order stable.

## 6. Baseline verification

- `npm run build` — exit 0, no chunk-size warning (vendor splitting active).
- Browser: app mounts, panels (Hotspots/Trips/Analytics/Admin) render,
  console clean.
- Git: 22 commits on `main`, clean working tree.
