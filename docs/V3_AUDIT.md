# STARS V3 — Project Audit (41-Phase Master Prompt, Phase 1)

Date: 2026-10-08 · Branch: `main` (60 commits, clean tree)
Scope: inspect the existing repository before proceeding through the
41-phase master prompt. **No application behavior was modified in this phase.**

---

## 1. Inventory

| Area | Current state |
| --- | --- |
| Total source | 14,320 lines across `src/` |
| `src/App.jsx` | **4,459 lines** — single largest file, composition root + map wiring |
| `src/features/` | 46 files in 7 feature folders (routing, safety, road-conditions, community, admin, emergency, map) |
| `src/services/` | 6 files (httpClient, backend, incidentService, hazardService, potholeDetection, voiceNavigation) |
| `src/hooks/` | 2 files (useHazardAlerts, useTripHistory) |
| `src/components/` | 1 file (ErrorBoundary — app shell) |
| Dependencies | 7 runtime (react, react-dom, mapbox-gl, recharts, lucide-react, exifr, tesseract.js), 5 dev — all confirmed in use |
| Tests | 10 suites (`tests/t21`–`t29`, `t33`) + dependency-free runner, `npm test` |
| Docs | README (21 sections), docs/ARCHITECTURE_BASELINE.md (historical), docs/SECURITY_AUDIT.md |

## 2. Findings

**Duplicated functionality**
- Scoring is centralized: `features/safety/safetyScore.js` is the only score
  engine (route score, road score, night score, confidence banding all reuse
  it). No parallel scoring math found.
- One HTTP client for all network access (timeout/retry/TTL cache); no
  scattered raw `fetch` except the intentional detector error path.

**Oversized components**
- `App.jsx` (4,459 lines) remains the composition root: state, map wiring,
  effects and several JSX sections. Feature folders absorbed the extracted
  panels; App splitting is the natural next refactor (tracked as future work,
  not required by this phase).

**Unused dependencies** — none. `react-dom` (main.jsx), `tesseract.js`
(dynamic import in potholeDetection), `exifr`, charts, icons all referenced.

**Temporary / backup / generated files** — none found (`*.bak`, `*.orig`,
`*~`, `*.tmp` clean). `dist/` and `.env` are git-ignored; `node_modules`
untracked.

**Hardcoded values (documented demo/config)**
- Admin PIN `'1234'` (App.jsx:2948) — client-side demo gate, documented in
  README §14 and SECURITY_AUDIT §3.
- Safety weights (`DEFAULT_WEIGHTS`, 7 factors) — configurable table in
  safetyScore.js.
- Cluster threshold meters, hotspot radius, lifecycle status sets — module
  constants.

**Existing scoring systems** — single engine with confidence layer
(`assessFactorConfidence`), classification bands, and evidence coverage.

**Reusable components** — 18 feature panels + ErrorBoundary; grouped map
controls (`normalizeControlGroups`); explanation card shared by predictive UI.

**Environment configuration** — `.env` ignored/untracked; `.env.example`
holds empty placeholders (MAPBOX, OPENWEATHER, INCIDENTS, OVERPASS);
`VITE_API_BASE_URL` read defensively by the backend repository.

## 3. Status mapping of the 41-phase master prompt

Prior work already implemented most phases under equivalent commits.
Mapping (actual commit messages shown verbatim):

| Phase | Status | Commit (actual) |
| --- | --- | --- |
| 1 Project audit | **This phase** | `chore: audit STARS architecture for V3 upgrade` |
| 2 Security & repo hygiene | In place, re-verified | `fix: audit security posture and close a stored-XSS gap` (+ pre-existing `.gitignore`/`.env.example`) |
| 3 Centralized safety engine | Done | `feat: create centralized road safety intelligence engine` |
| 4 Accident/incident intelligence | Done (incidentService types incl. Accident; incident factor in weights) | included in engine/incident feeds history |
| 5 Multi-route comparison | Done (per-route analysis records feed route cards) | `feat: add road segment safety intelligence` era |
| 6 Safety-vs-time optimization | Done (`routePreferences.priority`: Safety First/Balanced/Time First) | `feat: add route preferences and road avoidance` |
| 7 Explainable recommendation | Done (`recommendation.js` reasons + time trade-off) | `feat: add explainable AI decision layer` (reasons pre-date it) |
| 8 Predictive engine | Done (15/30/60 min) | `feat: add predictive road safety risk engine` |
| 9 Predictive visualization | Done | `feat: add predictive safety visualization` |
| 10 Segment risk | Done | `feat: add road segment safety intelligence` |
| 11 Segment risk map | Done | `feat: visualize road segment risk on navigation map` |
| 12 AI detector interface | Done | `refactor: create extensible AI pothole detection interface` |
| 13 Image analysis workflow | Done | `feat: improve pothole image analysis workflow` |
| 14 Crowdsourced reporting | Done (11 hazard types) | `feat: expand crowdsourced road condition reporting` |
| 15 Hazard clustering | Done (`clusterReports`) | with crowdsourcing history |
| 16 Verification lifecycle | Done | `feat: add structured hazard verification workflow` |
| 17 Confidence system | Done | `feat: surface confidence and evidence indicators` |
| 18 Waterlogging risk | Done | `feat: add waterlogging and flood risk estimation` |
| 19 Night safety | Done | `feat: add night safety assessment and driving advice` |
| 20 Road health index | Done | `feat: add report-based road health index` |
| 21 Change detection | Done | `feat: add hazard database change detection` |
| 22 Repair priority | Done | `feat: add repair priority ranking for active hazards` |
| 23 Municipal dashboard | Done | `feat: add admin municipal dashboard overview` |
| 24 What-if simulation | Done | `feat: add what-if repair scenario simulation` |
| 25 Personalized preferences | Done | `feat: add route preferences and road avoidance` |
| 26 Emergency mode | Done | `feat: add emergency roadside assistance mode` |
| 27 Emergency services | Done | `feat: add nearby emergency service discovery` |
| 28 Explainable AI | Done | `feat: add explainable AI decision layer` |
| 29 Trip analytics | Done | `feat: add historical trip safety analytics` |
| 30 Backend preparation | Done (repository abstraction, LOCAL/HTTP kinds) | `refactor: prepare STARS for persistent road intelligence backend` |
| 31 Multi-user crowdsourcing | Done | `feat: support multi-user road hazard intelligence` |
| 32 Map control groups | Done (groups: Navigation/Safety/Hazards/Analytics) | `refactor: group map layer controls by concern` |
| 33 Performance | Done (lazy charts, memo, chunking) | `perf: defer chart library and memoize heavy panels` |
| 34 Error resilience | Done (error boundary, guarded promises) | `fix: harden error handling and add app-level error boundary` |
| 35 Responsive & accessibility | Done (Escape, live regions, resize sync) | `feat: improve accessibility and responsive behavior` |
| 36 Architectural refactoring | Done (7 feature folders) | `refactor: organize code into feature folders` |
| 37 Complete testing | Done (10 suites + build) | `test: add comprehensive regression suite with npm test runner` |
| 38 Documentation | Partial — README has 21 sections; master prompt requires 25 specific sections | `docs: rewrite README as a 21-section guide to the V3 system` |
| 39 Final security audit | Done | `fix: audit security posture and close a stored-XSS gap` |
| 40 Final cleanup | Done (nothing obsolete found) | `docs: mark architecture baseline as a historical snapshot` |
| 41 Final validation & release | Done | `release: v3.0.0 — intelligent road safety decision support system` |

**Open gaps to close in later phases of this prompt:**
1. Phase 38 — rewrite README to the master prompt's exact 25-section list
   (Problem Statement, Objectives, Future Scope, etc.).
2. Final output — produce the required 32-section STARS V3 FINAL REPORT and
   a chronological commit list.
3. Per-phase reports will cite actual commit messages; where the master
   prompt's template wording differs from history, the actual message is
   reported (no empty or duplicate commits will be created).
