# Report 4 — Feature Matrix (Feature → Section → Module → Status)

Date: 2026-10-10 · Every feature from Groups A and B of
`docs/FEATURE_PLAN.md`, mapped to its single home in the six-section
interface. Status verified in Phase 14 (build, 13/13 suites, browser E2E).

## Navigate

| Feature | Module | Status |
| --- | --- | --- |
| Interactive Mapbox map | `app/App.jsx` map wiring, `features/map/*` | Working |
| Origin/destination search + map pick | `app/App.jsx`, Nominatim geocode | Working (empty/failure states) |
| Route calculation + alternatives | `app/App.jsx`, `routing/geo.js` | Working |
| Route comparison (Route Options) | `app/App.jsx` route list | Working |
| Safety-aware recommendation | `routing/recommendation.js`, RecommendationCard | Working (confidence + "why") |
| Safety analysis per route (Details) | `routing/routeAnalysis.js` | Working (factors + coverage) |
| Turn-by-turn directions | `app/App.jsx` directions panel | Working |
| Per-route traffic overlay | `routing/TrafficChart.jsx`, traffic fetch | Working (estimated label) |
| What-if scenario simulation | `routing/whatIf.js`, `WhatIfPanel.jsx` | Working (hypothetical label) |
| Route preferences (Safety/Balanced/Time) | `routing/routePreferences.js`, `RoutePreferencesPanel.jsx` | Working (Settings + dock entry) |
| Map intelligence dock | `features/map/MapControlDock.jsx`, `controlGroups.js` | Working (grouped dock) |
| Emergency mode | `features/emergency/*` | Working |

## Road Safety

| Feature | Module | Status |
| --- | --- | --- |
| Overall safety score + bands | `safety/safetyScore.js` | Working |
| Factor confidence indicators | `safety/confidence.js` | Working (Medium 5/7 shown) |
| Explainability (why) | `safety/explainability.js`, ExplanationCard | Working; extension point exported |
| Predictive estimates | `safety/prediction.js`, PredictiveSafetyPanel | Working |
| Road-segment risk | `routing/segmentRisk.js`, SegmentRiskStrip | Working |
| Waterlogging risk | `road-conditions/waterlogging.js` + panel | Working |
| Night safety | `road-conditions/nightSafety.js` + panel | Working |
| Hazard heatmap + clusters | `safety/heatmap.js`, `safety/clustering.js` | Working |
| Hazard alerts | `safety/hazardAlerts.js`, `HazardAlertStack.jsx`, `hooks/useHazardAlerts.js` | Working |
| Incident intelligence | `services/incidentService.js` | Working (unavailable → stated) |

## Report a Hazard

| Feature | Module | Status |
| --- | --- | --- |
| Unified report form (11 types) | `app/App.jsx`, `safety/hazardTypes.js` | Working (review step + live summary) |
| Photo evidence + EXIF | `services/potholeDetection.js` (exifr) | Working |
| AI pothole detection (OCR) | `services/potholeDetection.js` (tesseract.js, dynamic import) | Working, honestly labeled |
| Report tracking + status | `services/hazardService.js`, repo abstraction | Working |
| Hazard verification lifecycle | `features/admin/hazardLifecycle.js` | Working (admin-gated) |

## Trips

| Feature | Module | Status |
| --- | --- | --- |
| Trip history | `community/tripHistory.js`, `hooks/useTripHistory.js`, TripsPanel | Working (states: in progress / arrived / ended) |
| Trip analytics | `community/analytics.js`, AnalyticsPanel | Working (lazy-loaded) |

## Road Intelligence

| Feature | Module | Status |
| --- | --- | --- |
| Road Health Index | `road-conditions/roadHealth.js` + panel | Working |
| Change detection | `road-conditions/changeDetection.js` + panel | Working |
| Hotspots | `safety/hotspots.js`, HotspotsPanel | Working |
| Repair priority | `admin/repairPriority.js`, RepairPriorityPanel | Working |
| Municipal insights (admin-only) | `admin/municipalSummary.js`, MunicipalDashboard | Working (single entry point) |

## Settings

| Feature | Module | Status |
| --- | --- | --- |
| Route preferences | `routing/routePreferences.js` + panel | Working (persisted locally) |
| Map/display controls | `features/map/MapLayersPopover.jsx` | Working |
| Voice settings + guidance | `services/voiceNavigation.js` | Working (unsupported → disabled) |

## Cross-cutting

| Concern | Module | Status |
| --- | --- | --- |
| Resilient HTTP (timeout/retry/TTL cache) | `services/httpClient.js` | Working (test-covered) |
| Storage/repository abstraction | `services/backend.js` (+ `VITE_API_BASE_URL`) | Working; `isBackendConfigured` test-covered |
| Error boundary | `components/ErrorBoundary.jsx` | Working |
| Design system | `index.css` (`.stars-*` tokens + classes) | Enforced; 0 unused classes |
| Accessibility + reduced motion | cross-cutting (Phase 11) | Enforced |
