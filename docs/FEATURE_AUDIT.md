# STARS Restructuring — Phase 1: Complete Project Audit

Date: 2026-10-10 · Branch: `main` (76 commits, clean tree before this phase)
Scope: full repository inspection ahead of the 15-phase restructuring prompt.
**No application behavior was modified in this phase.** This document is the
audit output; the code itself is untouched.

---

## 1. Repository inventory

| Area | State found |
| --- | --- |
| Total source | 15,124 lines across `src/` (JS/JSX) |
| `src/App.jsx` | **4,525 lines** — single-file composition root: state, map wiring, effects and most JSX |
| `src/features/` | 46 files in 7 folders (routing, safety, road-conditions, community, admin, emergency, map) |
| `src/services/` | 6 files (httpClient, backend, incidentService, hazardService, potholeDetection, voiceNavigation) |
| `src/hooks/` | 2 files (useHazardAlerts, useTripHistory) |
| `src/components/` | 1 file (ErrorBoundary) |
| Navigation model | **Single page** — no router, no top-level sections; every feature is reached through floating panels and the map control dock (16 → grouped dock) |
| Dependencies | 7 runtime (react, react-dom, mapbox-gl, recharts, lucide-react, exifr, tesseract.js) + 5 dev (vite, tailwind, postcss, autoprefixer, plugin-react) — **all confirmed in use** |
| Tests | 13 suites (`tests/t21`–`t29`, `t33`–`t36`) + dependency-free runner `npm test`; includes text-level workflow, a11y and resilience assertions |
| Docs | README (25 sections), docs/ARCHITECTURE_BASELINE.md, docs/SECURITY_AUDIT.md, docs/V3_AUDIT.md, docs/STARS_V3_FINAL_REPORT.md |
| Env config | `.env` untracked, `.env.example` placeholders; `VITE_MAPBOX_TOKEN`, `VITE_OPENWEATHER_KEY`, `VITE_INCIDENTS_URL`, `VITE_OVERPASS_URL`, `VITE_API_BASE_URL` |
| Repo hygiene | `dist/`, `node_modules/`, `.env` untracked; `vite.log` present but untracked (dev-server artifact from this session) |
| History | 76 commits: `v1` monolith → safety-intelligence wave → V3 intelligence upgrade → V4 UI redesign (current) |

Baseline comparison with `v1` (`ec12578`, 3,297-line App.jsx): v1 contained
map/search/route/traffic/weather, pothole reporting with camera + tesseract/exifr,
and the admin dashboard. Everything else post-dates v1 (safety scoring, incidents,
voice, trips, hotspots, emergency, waterlogging, night, road health, what-if,
municipal, prediction, segment risk, preferences).

---

## 2. Feature inventory (required table)

Statuses: Working · Partially Working · Broken · Placeholder · Unused · Duplicate · Not Implemented · Unable to Verify

| Feature | Original/New | Implementation Status | Used in UI? | Connected? | Recommended Action |
| --- | --- | --- | --- | --- | --- |
| Interactive Mapbox map (markers, layers, popups) | Original | Working | Yes | Yes | Preserve (Group A) |
| Origin/destination search + map picking | Original | Working | Yes | Yes | Preserve |
| Route calculation + multiple alternatives | Original | Working | Yes | Yes | Preserve |
| Route comparison (Route Options table/cards) | Original | Working | Yes | Yes | Preserve |
| Traffic conditions per route + TrafficChart (lazy) | Original | Working | Yes | Yes | Preserve |
| Weather conditions (OpenWeather, graceful fallback) | Original | Working | Yes | Yes | Preserve |
| Pothole reporting (camera/upload, GPS, EXIF via exifr) | Original | Working | Yes | Yes | Preserve (Group A) |
| AI OCR detector (tesseract.js, assistive, honestly labeled) | Original | Working | Yes (assistive step) | Yes | Preserve |
| Admin dashboard basics (report list, status changes) | Original | Working | Yes (PIN-gated) | Yes | Preserve, admin-only |
| General hazard reporting (11 types, shared form) | New | Working | Yes | Yes | Preserve (single unified form already) |
| Centralized safety scoring engine (7 factors, bands) | New | Working | Yes | Yes | Preserve (Group A) |
| Route analysis + factor breakdown | New | Working | Yes | Yes | Preserve |
| Safety-aware recommendation + reasons | New | Working | Yes | Yes | Preserve |
| Route preferences (Safety First/Balanced/Time First) | New | Working | Yes (panel) | Yes | Preserve → relocate to Settings (Phase 3) |
| Road avoidance (unpaved/tolls → Mapbox exclude) | New | Working | Yes | Yes | Preserve |
| Incident intelligence (feed + external URL) | New | Working | Yes | Yes | Preserve |
| Proactive hazard alerts (stack + voice) | New | Working | Yes | Yes | Preserve |
| Predictive safety 15/30/60 min (lazy panel) | New | Working | Yes | Yes | Preserve, keep "prediction" label |
| Segment risk strip + map overlay | New | Working | Yes | Yes | Preserve |
| Time-of-day risk / safest window | New | Working | Yes | Yes | Preserve |
| Confidence & evidence indicators | New | Working | Yes | Yes | Preserve |
| Hazard hotspots ranking (lazy panel) | New | Working | Yes | Yes | Preserve |
| Safety heatmap map layer | New | Working | Yes | Yes | Preserve |
| Hazard clustering / duplicate grouping | New | Working | Yes (map) | Yes | Preserve |
| Hazard verification lifecycle | New | Working | Yes (admin) | Yes | Preserve, admin-only |
| Voice guidance (navigation + safety toggles) | New | Working | Yes (settings) | Yes | Preserve |
| Trip history (auto-record on route open, arrival completion) | New | Working | Yes (dock → Trips) | Yes | Preserve |
| Trip safety analytics (lazy AnalyticsPanel) | New | Working | Yes | Yes | Preserve |
| Waterlogging/flood risk (dock toggle) | New | Working | Yes | Yes | Preserve (requires routes) |
| Night safety assessment | New | Working | Yes | Yes | Preserve (requires routes) |
| Road Health Index | New | Working | Yes | Yes | Preserve |
| Hazard change detection vs baseline | New | Working | Yes | Yes | Preserve |
| Repair priority ranking | New | Working | Yes | Yes | Preserve |
| Municipal dashboard (summary, filters) | New | Working | Yes (admin) | Yes | Preserve, admin-only; check overlap (Phase 10) |
| What-if repair simulation | New | Working | Yes | Yes | Preserve, hypothetical label mandatory |
| Emergency mode + nearby services (Overpass) | New | Working | Yes | Yes | Preserve; Overpass = external dependency |
| Map control dock (5 groups, badges) | New | Working | Yes | Yes | Preserve |
| Journey stepper + Swap endpoints | New | Working | Yes | Yes | Preserve |
| Design system (`stars-*` tokens in index.css) | New | Working | Yes | Yes | Preserve, extend (Phase 6) |
| HTTP client (timeout/retry/TTL cache) | New | Working | n/a | Yes | Preserve |
| Backend repository abstraction (LOCAL/HTTP) | New | Partially Working — LOCAL verified; HTTP path **Unable to Verify** (no backend configured) | n/a | Yes | Preserve, document limitation |
| Error boundary + guarded async flows | New | Working | Yes | Yes | Preserve |
| Admin PIN dialog (client-side demo gate) | New | Working | Yes | Yes | Preserve, document security caveat |
| `detectPothole` (singular, legacy wrapper) | New | **Unused** — dead export, superseded by `detectPotholes` | No | No | Remove (Phase 4) |
| 13 further dead exports (§3 list) | Mixed | **Unused** (exported, never imported) | No | No | Remove or keep as documented extension points (Phase 4/13) |

Historical removals (not current features — recorded here for the Phase-15
removal report): the v1 helper scripts `cleanup_app.py` / `fix_layout.py`
(`877efaf`) and the native `window.prompt` admin gate replaced by the in-app
dialog (`2ce70c8`). Neither exists in the current tree.

No feature was classified *Unused* solely on a static-import miss: lazy panels
(`AnalyticsPanel`, `PredictiveSafetyPanel`, `TrafficChart`) load through
`React.lazy` and dynamic `import()` in `potholeDetection.js`; routing/configuration
references were checked before classification.

---

## 3. Duplicates, dead code and structural findings

**Duplicates checked — none confirmed**
- Scoring: single engine (`features/safety/safetyScore.js`), no parallel math.
- Network: single HTTP client; raw `fetch` only in the intentional detector error path.
- Reporting: one search form, one unified hazard-report form — no near-identical per-type forms.
- Dashboards: Municipal (admin) vs Analytics (trips) vs Hotspots (map) draw on
  different sources, but several panels repeat safety-adjacent summaries —
  consolidation candidate for Phase 10, not a confirmed duplicate today.

**Dead exports found (14)** — `node .tmp-audit-exports.cjs` scan of all `src/` exports:

| File | Unused export | Note |
| --- | --- | --- |
| services/potholeDetection.js | `detectPothole` | legacy singular API, superseded |
| safety/explainability.js | `clearInferenceModel` | model-registry extension point |
| safety/clustering.js | `DEFAULT_CLUSTER_THRESHOLD_METERS` | constant |
| safety/hazardTypes.js | `HAZARD_CATEGORIES`, `groupReportsByType` | |
| community/crowdsourcing.js | `CROWDSOURCING_LABEL`, `summarizeCluster` | |
| community/tripHistory.js | `isActiveTrip` | |
| emergency/emergencyMode.js | `EMERGENCY_MAX_NEARBY` | |
| emergency/emergencyServices.js | `SERVICES_MAX_RESULTS`, `clearEmergencyServicesCache` | cache clear useful for tests |
| services/backend.js | `isBackendConfigured` | |
| services/potholeDetection.js | `validateReportCoord` | |

**Structural findings (drive later phases)**
1. `App.jsx` (4,525 lines) holds state, map wiring and JSX for every panel —
   the primary modularization target (Phase 5).
2. No top-level section navigation; 12+ floating `show*` toggles. Target IA
   (Navigate / Road Safety / Report a Hazard / Trips / Road Intelligence /
   Settings) does not exist yet (Phase 3).
3. Safety-adjacent information is spread across the route card, route options,
   segment strip, and 8 dock-toggled panels — consolidation candidate (Phase 8).
4. Duplicate-control check: dock groups + overlay chips + floating buttons all
   act on distinct state; no control currently performs the same action twice.
5. Unused styles: no orphaned custom classes in `index.css`; all `stars-*` tokens referenced.
6. Unused dependencies: none. Temporary/backup files: none (except untracked `vite.log`).

**Environment/verification caveats**
- Weather/incidents/Overpass require network + keys → engine logic unit-tested,
  live API paths **Unable to Verify** offline.
- Admin operations are client-side with a demo PIN — documented, not real auth.
- HTTP backend mode requires `VITE_API_BASE_URL` and a server that does not exist
  in this repo → **Unable to Verify**; LOCAL mode is the default.

---

## 4. Baseline verification (this phase)

- `npm run build` → exit 0 (prior check this session, sources unchanged since)
- `npm test` → exit 0, 13/13 suites
- Working tree: clean except this document
