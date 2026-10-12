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

| Spec page | Current section | Gap |
| --- | --- | --- |
| Navigate `/navigate` | `navigate` Navigate | name ok |
| Safety `/safety` | `safety` "Road Safety" | rename |
| Hazards `/hazards` | `report` "Report a Hazard" | rename + **missing hazard listings** (section shows only the form, `SectionViews.jsx:160`; spec requires existing hazards with type/severity/location/verification status) |
| Environment `/environment` | — | **missing entirely** (traffic/weather exist only as per-route panels and map layers; no page with data-availability/source status) |
| Analytics `/analytics` | `trips` Trips (history + safety analytics) | rename; content qualifies as trip analytics with real data |
| Tools `/tools` | `settings` Settings (route preferences, voice) | rename; Road Intelligence's what-if simulation also belongs to Tools conceptually |
| (justified extra) | `intelligence` Road Intelligence | retain: road health, hotspots, change detection, repair priority, municipal dashboard are advertised core features |

No URL routes exist; paths in the spec are suggested and navigation must
not reset route state (hash routing can preserve it — map stays mounted).

### 3.2 Route recommendation and safety labels (Phase 5 — correctness)

Engine (`src/features/routing/recommendation.js`):

- ✅ `recommendRoute()` computes `fastestIndex`, `isFastest`,
  `safetyAdvantage` (= winner − fastest; negative/zero handled), tie-break
  on duration; reasons are data-driven (`buildRecommendationReasons`).
- ✅ Classification bands correct: 40–59 → **Risky**
  (`safetyScore.js:27`), matching the spec example.
- ❌ Engine does not compute **shortest** (min distance) or **safest**
  (unique max score) indexes the spec requires for labels.
- ❌ UI hard-codes "safer" regardless of data:
  - `App.jsx:4105` panel header **"Recommended safer route"** and
    `App.jsx:4103` `aria-label` — shown even when `safetyAdvantage === 0`
    (tied scores) or when the recommendation is purely time-based.
    Spec rule 2 forbids safer claims on ties; rule: time-only
    recommendations must read **"Fastest Available Route"**.
  - `RouteCard.jsx:78` RECOMMENDED badge `title="Recommended safer route"` —
    same defect.
- ❌ `+${safetyAdvantage} safety points` (`App.jsx:4119`) renders
  "+0 safety points" on ties instead of explicitly communicating the tie
  (spec rule 7).
- ❌ No **Shortest** or **Safest** badge on cards (spec rules 1–4).
- ⚠ `RouteCard.jsx:89` shows "Fastest" for every route whose duration
  equals the minimum — ambiguous when durations tie; tie should be labeled.
- ⚠ Selected badge reads "Primary" (`RouteCard.jsx:86`) — spec distinguishes
  Selected vs Recommended vs Fastest; "Primary" is an extra unlabeled term.

### 3.3 Controls, panels, theme, responsive (Phases 3, 4, 6–9)

Already satisfied by committed work (commits in §2 plus `e4732cc` theme,
`fc247d4` collision/heading fix, `d60546f` 320px overflow, accessibility
pass: `:focus-visible`, `prefers-reduced-motion`, live regions, AA
contrast). Remaining: no Environment page (§3.1) and label correctness
(§3.2).

## 4. Phase plan derived from findings

1. Phase 2: rename sections to Safety / Hazards / Analytics / Tools; add
   Environment page; add hazard listings to Hazards; optional hash paths.
2. Phase 5: compute shortest/safest/tie metadata; fix all "safer" claims;
   add Fastest/Shortest/Safest/Selected badges with tie handling.
3. Phases 3, 4, 6, 7, 8, 9: verify committed work against the checklist.
4. Phases 10–11: full regression run, docs, release.
