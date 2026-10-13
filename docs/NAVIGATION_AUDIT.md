# STARS Navigation Audit (Phase 1 — route results and application state)

Scope: Find Route handler, map route layers, route-count labels, comparison
table, recommendation panel, route cards, directions, section controls,
panel/page visibility, selected-route state, cached/persisted route data.
No destructive changes were made in this phase.

## 1. Application-page architecture (current)

- **No router installed** (`package.json` has no `react-router` or similar).
  Navigation is `activeSection` state in `src/app/App.jsx:236`.
- Section definitions: `STARS_SECTIONS` (`App.jsx:113–119`) —
  `navigate` / `safety` / `report` / `trips` / `intelligence` / `settings`.
- Navigate's route-results grid is hidden when another section is active
  (`App.jsx:3524` adds `hidden`); other sections render through
  `SectionViews` (`App.jsx:4583`).
- The map stays mounted while other sections are open and is re-measured
  when Navigate returns (`App.jsx:241`), so route state survives navigation.

## 2. Why controls no longer display the same route content

Historically one shared content component and shared panel booleans showed
route results everywhere. Current state after the UI restructuring commits:

| Mechanism | Status |
| --- | --- |
| Route results rendered only on Navigate | ✅ grid hidden + `SectionViews` renders distinct content (`14b89a0`) |
| One visibility boolean for unrelated panels | ❌→fixed: per-panel state (`openDetailsId`, `openTrafficId`, `openIncidentId`, `openWeatherId`) |
| Toolbar buttons triggering route calculation | ❌→fixed: dock groups only toggle map layers (`38c3b29`) |
| Report form always visible on Navigate | ❌→fixed: contextual dialog + section form (`4ea6307`, `984e19b`) |
| Route count shown once | ❌→fixed: visible "N routes available" + sr-only live region (`e47c7bd`) |
| Duplicate route cards / comparison table | ❌→fixed: cards + one comparison region + recommendation summary, details on request (`22f7423`, `463fe0b`) |

## 3. Gaps against the required spec

### 3.1 Page set and naming (Phase 2)

| Spec page | Current section | Status |
| --- | --- | --- |
| Navigate `/navigate` | `navigate` Navigate | ✅ shipped |
| Safety `/safety` | `safety` Safety (route score + risk panels) | ✅ renamed (`759bb98`) |
| Hazards `/hazards` | `report` Hazards (listing + report form) | ✅ renamed (`759bb98`); hazard listing added — type, severity, location, review status, and a "Show on map" action that returns to Navigate and flies to the report |
| Environment `/environment` | `environment` Environment (traffic, weather, data-source status) | ✅ page added (`759bb98`) |
| Analytics `/analytics` | `trips` Analytics (history + safety analytics) | ✅ renamed (`759bb98`) |
| Tools `/tools` | `settings` Tools (route preferences, voice) | ✅ renamed (`759bb98`); Road Intelligence's what-if simulation also belongs to Tools conceptually |
| (justified extra) | `intelligence` Road Intelligence | retained: road health, hotspots, change detection, repair priority, municipal dashboard are advertised core features |

Hash routing ships: section keys double as URL hash segments (`#/navigate`,
`#/safety`, …). The map stays mounted while other sections are open, so
navigation never resets route state.

### 3.2 Route recommendation and safety labels (Phase 5 — correctness)

Engine (`src/features/routing/recommendation.js`):

- ✅ `recommendRoute()` computes `fastestIndex`, `isFastest`,
  `safetyAdvantage` (= winner − fastest; negative/zero handled), tie-break
  on duration; reasons are data-driven (`buildRecommendationReasons`).
- ✅ Classification bands correct: 40–59 → **Risky**
  (`safetyScore.js:27`), matching the spec example.
- ✅ Engine computes **shortest** (`shortestIndex`, min distance) and
  **safest** (`safestIndex`, unique max score) indexes, plus tie flags
  (`shortestTied`, `safestTied`, `safetyTiedWithFastest`) — ties report
  `null` index so the UI can say so (`1c3bbc5`).
- ✅ UI no longer hard-codes "safer":
  - Time-only recommendations read **"Fastest Available Route"**; the
    summary only claims a safety advantage when `safetyAdvantage > 0` and
    states an explicit tie when it is `0` (spec rules 2, 7) (`1c3bbc5`).
  - RECOMMENDED badge title is honest about the basis (`1c3bbc5`).
- ✅ **Shortest** and **Safest** badges render on cards, with tie labels
  (spec rules 1–4) (`1c3bbc5`).
- ✅ "Fastest" is tie-aware: shows **"Fastest (tied)"** when durations
  share the minimum (`1c3bbc5`).
- ✅ Selected badge reads **"Selected"** (not "Primary"), matching the
  spec's Selected vs Recommended vs Fastest distinction (`1c3bbc5`).

### 3.3 Controls, panels, theme, responsive (Phases 3, 4, 6–9)

Already satisfied by committed work (commits in §2 plus `e4732cc` theme,
`fc247d4` collision/heading fix, `d60546f` 320px overflow, accessibility
pass: `:focus-visible`, `prefers-reduced-motion`, live regions, AA
contrast). Environment page (§3.1) and label correctness (§3.2) are now
shipped — see `759bb98` (Environment section) and `1c3bbc5` (labels).
Dark-mode chart tooltips themed (`abee83a`); 320px body `min-width`
overflow removed (`544e97f`); missing-basemap-sprite warning silenced
(`8e4b3e0`).

## 4. Phase plan derived from findings

1. Phase 2: rename sections to Safety / Hazards / Analytics / Tools; add
   Environment page; add hazard listings to Hazards; optional hash paths.
2. Phase 5: compute shortest/safest/tie metadata; fix all "safer" claims;
   add Fastest/Shortest/Safest/Selected badges with tie handling.
3. Phases 3, 4, 6, 7, 8, 9: verify committed work against the checklist.
4. Phases 10–11: full regression run, docs, release.

**Outcome (all phases complete):** every item above shipped. Regression is
green — `vite build` succeeds and all 13 test suites pass
(`node tests/run-all.mjs`). This audit's findings are reconciled with the
code: the ✅/❌→fixed markers cite the commit that closed each one.
