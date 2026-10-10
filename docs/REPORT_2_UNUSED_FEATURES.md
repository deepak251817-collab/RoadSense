# Report 2 — Implemented but Unused (Group D Final Disposition)

Date: 2026-10-10 · Source: `docs/FEATURE_PLAN.md` Group D (mandatory separate
report). This is the final state after Phases 4, 13 and 15.

## Orphan-feature check (re-verified in Phase 13)

Every component file is reachable. The three lazy panels (`AnalyticsPanel`,
`PredictiveSafetyPanel`, `TrafficChart`) load via `React.lazy`;
`detectPotholes` loads via dynamic `import()`. **No page, panel, service
function or control is disconnected from the UI**, and the dead-export scan
returns **zero** unexplained exports.

## Symbol-by-symbol disposition

| Symbol | Plan decision | Final disposition |
| --- | --- | --- |
| `detectPothole` | Remove | **Removed** (`86f7645`) — superseded by tested `detectPotholes` |
| `CROWDSOURCING_LABEL` | Remove | **Removed** (`86f7645`) |
| `summarizeCluster` | Retain (test-covered) | **Retained** — exercised by `tests/t24.mjs` |
| `isActiveTrip` | Remove | **Removed** (`86f7645`) |
| `EMERGENCY_MAX_NEARBY` | Remove | **Retained as module-private** — Phase 5 gave it real callers (`nearbyActiveReports`, `nearbyIncidents`); un-exported in Phase 13 |
| `SERVICES_MAX_RESULTS` | Remove | **Retained as module-private** — caller `parseOverpassServices`; un-exported in Phase 13 |
| `clearEmergencyServicesCache` | Remove | **Removed** (`86f7645`) — cache itself kept |
| `DEFAULT_CLUSTER_THRESHOLD_METERS` | Remove | **Retained as module-private** — default for `clusterReports`; un-exported in Phase 13 |
| `clearInferenceModel` | Retain (documented extension point) | **Retained and re-exported** — Phase 13 deleted it; Phase 15 restored it as the pair of `registerInferenceModel` per this plan and `docs/FEATURE_AUDIT.md` |
| `HAZARD_CATEGORIES` | Remove | **Removed** (`86f7645`) |
| `groupReportsByType` | Remove | **Removed** (`86f7645`) |
| `isBackendConfigured` | Retain (test-covered) | **Retained** — asserted by `tests/t22.mjs` |
| `validateReportCoord` | Remove | **Removed** (`86f7645`) |

## Phase 13 extension

Beyond the table above, Phase 13 re-scanned all 60 source files:

- **82 exports** used only inside their own module lost `export`
  (module-private, not deleted — all have internal callers).
- **7 CSS classes** with zero JSX references removed
  (`.stars-display`, `.stars-h1`, `.stars-num`, `.stars-card-pad`,
  `.stars-divider`, `.stars-note`, `.stars-note-info`, `.stars-note-warn` —
  badge/button/skeleton variants were instead wired to real usages).
- **7 runtime dependencies** all referenced (tesseract.js via dynamic import).
- Final scan: **0 dead exports, 0 unused custom classes.**
