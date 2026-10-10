# STARS Restructuring — Phase 2: Feature Classification and Cleanup Plan

Date: 2026-10-10 · Based on: `docs/FEATURE_AUDIT.md` (Phase 1, commit `9df2b62`)
Classification of every discovered feature into Groups A–D with a
feature-by-feature cleanup plan. **No code was removed in this phase.**

---

## Group A — Core Features to Preserve

Every expected core feature was located, verified Working, and is marked Preserve.
None is removed or rewritten.

| Feature | Where it lives | Verdict |
| --- | --- | --- |
| Interactive Mapbox map | `App.jsx` map wiring, `features/map/*` | Preserve |
| Origin & destination selection | App.jsx search/map-pick, journey stepper | Preserve |
| Route calculation + alternatives | App.jsx + `routing/geo.js` | Preserve |
| Route comparison | Route Options (App.jsx) | Preserve |
| Traffic information | per-route traffic + `routing/TrafficChart.jsx` | Preserve |
| Weather information | OpenWeather integration + fallbacks | Preserve |
| Road-safety scoring | `features/safety/safetyScore.js` | Preserve |
| Pothole reporting | unified report form + `services/potholeDetection.js` | Preserve |
| Hazard reporting (11 types) | `features/safety/hazardTypes.js` + `services/hazardService.js` | Preserve |
| Hazard visualization | heatmap, clusters, markers | Preserve |
| Hazard verification | `features/admin/hazardLifecycle.js` (admin-gated) | Preserve |
| Safety-aware route recommendation | `routing/recommendation.js` | Preserve |
| Responsive navigation interface | responsive + a11y passes (re-verify Phase 11) | Preserve |

## Group B — Valuable Advanced Features

All 16 advanced features exist, are genuinely implemented (no placeholders),
and fit the product. **All retained.**

| Feature | Module | Verdict |
| --- | --- | --- |
| Incident risk intelligence | `services/incidentService.js` | Retain |
| Explainable route recommendations | `safety/explainability.js` + RecommendationCard | Retain |
| Safety-vs-time preferences | `routing/routePreferences.js` (moves to Settings in Phase 3) | Retain |
| Predictive safety estimates | `safety/prediction.js` + PredictiveSafetyPanel | Retain |
| Road-segment risk | `routing/segmentRisk.js` + SegmentRiskStrip | Retain |
| Road Health Index | `road-conditions/roadHealth.js` | Retain |
| Waterlogging risk | `road-conditions/waterlogging.js` | Retain |
| Night safety analysis | `road-conditions/nightSafety.js` | Retain |
| Hazard clustering | `safety/clustering.js` | Retain |
| Data-confidence indicators | `safety/confidence.js` | Retain |
| Municipal repair priorities | `admin/repairPriority.js`, `admin/municipalSummary.js` | Retain (admin-only) |
| Scenario simulation | `routing/whatIf.js` | Retain (hypothetical label mandatory) |
| Trip analytics | `community/analytics.js` + AnalyticsPanel | Retain |
| Nearby emergency services | `emergency/emergencyServices.js` (Overpass = external dep) | Retain |
| Emergency navigation mode | `emergency/emergencyMode.js` | Retain |
| AI pothole detection | `services/potholeDetection.js` (tesseract.js OCR, assistive, honestly labeled) | Retain |

## Group C — Redundant or Unnecessary

Checked every category the prompt lists. Confirmed removals are code-level
artifacts; UI features are not confirmed redundant today.

| Item | Kind | Evidence | Plan |
| --- | --- | --- | --- |
| 10 dead exports (listed in Group D) | Internal code | Zero references in `src/` or `tests/` | Remove in Phase 4 |
| `vite.log` (untracked dev artifact) | Temporary file | Dev-server output from this session | Delete in Phase 4 |
| Duplicate safety-score cards | UI | **Not confirmed** — surfaces draw different sources (route card vs segment strip vs panels) | Consolidate presentation in Phase 8, do not delete engines |
| Duplicate dashboards | UI | **Not confirmed** — Municipal (admin), Analytics (trips), Hotspots (map) are distinct | Verify overlap in Phase 10 |
| Duplicate controls for same action | UI | **Not confirmed** — dock/chips/buttons drive distinct state | None |
| Redundant dependencies | Deps | All 7 runtime deps referenced (Phase 1 scan) | None |
| Obsolete dev pages / backups / old versions | Files | None found (`*.bak`, `*.orig`, `*~` clean; v1 scripts already gone) | None |

## Group D — Implemented but Unused (mandatory separate report)

**Orphan-feature check: none.** Every component file is reachable — the three
lazy panels (`AnalyticsPanel`, `PredictiveSafetyPanel`, `TrafficChart`) load
via `React.lazy`, and `detectPotholes` loads via dynamic `import()`. No page,
panel, service function or control is disconnected from the UI.

The unused items are **exported symbols with zero callers**:

| Feature / symbol | Files | Current State | Why Unused | Reusable logic? | Recommended Decision |
| --- | --- | --- | --- | --- | --- |
| `detectPothole` (singular) | `services/potholeDetection.js` | Working wrapper | Superseded by multi-detection facade `detectPotholes` (the tested API) | No — thin wrapper | **Remove** |
| `CROWDSOURCING_LABEL` | `features/community/crowdsourcing.js` | Working constant | Never referenced | No | **Remove** |
| `summarizeCluster` | `features/community/crowdsourcing.js` | Working, **used by tests/t24** | No UI caller; tests exercise it | Yes — cluster summary | **Retain** (test-covered utility) |
| `isActiveTrip` | `features/community/tripHistory.js` | Working helper | No caller; hook uses explicit arrival logic | Minor | **Remove** |
| `EMERGENCY_MAX_NEARBY` | `features/emergency/emergencyMode.js` | Working constant | Never referenced | No | **Remove** |
| `SERVICES_MAX_RESULTS` | `features/emergency/emergencyServices.js` | Working constant | Never referenced | No | **Remove** |
| `clearEmergencyServicesCache` | `features/emergency/emergencyServices.js` | Working helper | No caller, no test | Yes — test/debug utility | **Remove** (cache stays) |
| `DEFAULT_CLUSTER_THRESHOLD_METERS` | `features/safety/clustering.js` | Working constant | Never referenced; callers pass thresholds explicitly | No | **Remove** |
| `clearInferenceModel` | `features/safety/explainability.js` | Working helper | Pair of the documented `registerInferenceModel` extension point; no model registered by default | Yes — extension point | **Retain for future use** (documented) |
| `HAZARD_CATEGORIES` | `features/safety/hazardTypes.js` | Working constant | No caller | Possible future filter | **Remove** (re-addable) |
| `groupReportsByType` | `features/safety/hazardTypes.js` | Working helper | No caller | Possible future grouping | **Remove** (re-addable) |
| `isBackendConfigured` | `services/backend.js` | Working, **used by tests/t22** | No UI caller; tests assert unconfigured default | Yes — config guard | **Retain** (test-covered utility) |
| `validateReportCoord` | `services/potholeDetection.js` | Working helper | No caller anywhere | No — duplicated inline | **Remove** |

## Cleanup plan by phase

- **Phase 3** — establish 6-section navigation (Navigate / Road Safety / Report a Hazard / Trips / Road Intelligence / Settings); map every existing panel into exactly one section; route preferences move into Settings.
- **Phase 4** — delete the 10 Remove-listed dead exports + `vite.log`; update any import (none expected); re-run dead-export scan.
- **Phase 5** — split `App.jsx` (4,525 lines) into feature modules; move, don't rewrite; verify with build + 13 suites after every move.
- **Phases 6–10** — design-system completion, navigation screen, safety consolidation, hazard workflow, dashboard consolidation against this plan.
- **Phase 13** — final re-scan for anything Phase 3–12 orphaned.
- **Phase 15** — Group D table above becomes Report 2 in the final deliverables.

## Target application structure (input for Phase 3)

```text
Navigate          → map, search, routes, comparison, recommendation, hazards on map
Road Safety       → overall score, factors, confidence, prediction, segment risk, waterlogging/night
Report a Hazard   → unified form (type, evidence, location, severity, status)
Trips             → trip history + trip analytics (empty states)
Road Intelligence → road health, hotspots, changes, repair priority; Municipal (admin-only)
Settings          → route preferences (Safety/Balanced/Time), map/display controls, voice settings
```
