# STARS UI Audit (Phase 1 — UI restructuring)

Scope: `src/app/App.jsx` (4,662 lines), `src/app/sections/SectionViews.jsx`,
`src/features/**` components, `src/index.css`, Tailwind + theme config,
dialogs, mobile behavior. Verified against the running app at
`http://localhost:5173/`.

## Context

The app already has a six-section shell (Navigate / Road Safety / Report a
Hazard / Trips / Road Intelligence / Settings) from the V3 consolidation. This
audit targets the **remaining** duplication, always-visible panels, repeated
controls and theme gaps.

## 1. Duplicate route labels

"Route N" is index-derived (`Route ${idx + 1}`) and rendered in **six places**:

| # | Surface | Location |
| --- | --- | --- |
| 1 | On-map route chips (bottom-left) | `App.jsx:4015` (`Route {idx + 1}`) |
| 2 | Route cards in "Route Options" | `App.jsx:4160` (`Route {idx + 1}`) |
| 3 | Comparison table | `App.jsx:4106` via `a.label` (`routeAnalysis.js:207`) |
| 4 | Road Safety section list | `SectionViews.jsx:99` (`Route {i + 1}`) |
| 5 | Map label layer (marker) | `App.jsx:902` (`Route ${i + 1}`) |
| 6 | Map popup on label marker | `App.jsx:943` (`Route ${idx+1}`) |

Numbering is *consistent* (all index-based) but there is **no stable route id**:
identity is `String(idx)` comparisons scattered across ~10 state checks
(`openDetailsId`, `openTrafficId`, `openIncidentId`, `openWeatherId`,
`selectedRouteId`). Route cards are the primary surface; the map chip + label
layer are legitimate compact identifiers but currently repeat the full
"Route N" text with no shared component.

## 2. Duplicate route-count indicators

- The only "N routes found" string is **screen-reader-only**
  (`App.jsx:4029`, `sr-only` aria-live region). Sighted users never see the
  total count anywhere — the "Route Options" heading (`App.jsx:4045`) has none.
- Requirement "3 routes available — displayed once" is therefore **not met
  visually**: zero visible count indicators (and no separately maintained
  hardcoded count either — `routes.length` is derived at each site).
- "Stops (n)" (`App.jsx:3679`) is a separate count and is fine.

## 3. Always-visible reporting panels

- The hazard report card (`reportCardEl`, defined `App.jsx:2986–3216`) is
  rendered **permanently at the bottom of the Navigate screen**
  (`App.jsx:4513`: `{activeSection === "navigate" && reportCardEl}`) *and*
  again in the Report a Hazard section (`SectionViews.jsx:165`). The full
  upload workflow (type, camera, EXIF/GPS, OCR, severity, description,
  submit) is visible on the main navigation screen even when unwanted.
- A floating camera FAB (`App.jsx:3988`) scrolls to that card and opens the
  camera modal — the reporting entry points are therefore doubled (FAB +
  section + always-visible card).

## 4. Repeated controls

| Feature | Control A | Control B |
| --- | --- | --- |
| Route preferences | Dock "Preferences" toggle → overlay panel (`App.jsx:3703`, `3847`) | Settings section panel (`SectionViews.jsx:245`) |
| Scenario simulation | Dock "Simulate" → overlay (`App.jsx:3702`, `3858`) | Road Intelligence "Scenario simulation" chip (`SectionViews.jsx:196`) |
| Voice settings | Dock "Voice" custom control (`App.jsx:3705–3740`) | Settings voice-guidance card (`SectionViews.jsx:262`) |
| Analytics | Dock "Analytics" group → overlay (`App.jsx:3810`) | Trips section AnalyticsPanel (`SectionViews.jsx:183`) |
| Traffic toggle | Per-route card "Traffic" button (`App.jsx:4222`) | Floating map FAB "Traffic on route" (`App.jsx:3955`) |
| Weather toggle | Per-route card "Weather" button (`App.jsx:4249`) | Floating map FAB "Weather on route" (`App.jsx:3967`) |
| Emergency | Dock "Emergency" toggle (`App.jsx:3701`) | EmergencyPanel overlay (`App.jsx:3838`) — no section home |

Same-state pairs mean the same feature can be opened from two surfaces that
render two different instances of the same panel.

## 5. Overlapping map panels

- Map viewport is `h-96 lg:h-[540px]` (`App.jsx:3876`) and carries: control
  dock (top), **5 stacked FABs bottom-right** (search, location, traffic,
  weather, camera — `App.jsx:3939–3999`), on-map route chips bottom-left with
  `max-h-[45%]` (`App.jsx:4003`), plus Mapbox's own attribution/compass. On
  small screens chips and FABs cover most of the map.
- Overlays (Analytics/Emergency/Prefs/WhatIf panels) render above the map in
  the same column, and "Full" map mode goes `fixed inset-0 z-40` over the
  whole app (`App.jsx:3876`).

## 6. Inconsistent spacing and styling

- **No theme system**: `tailwind.config.js` has no `darkMode` key (Tailwind
  v3 defaults to `media`), there is no toggle, no theme provider and no
  persisted preference (localStorage only holds `showFixed`,
  `showOnlyUnverified`, `adminMessages`). Dark styling exists only via
  `dark:` media queries following the OS.
- 17 inline `style={{}}` usages in `App.jsx` (classification colors, bar
  widths, heights) alongside the `.stars-*` design system.
- Mixed card idioms: `.stars-card` vs raw `bg-white dark:bg-gray-900
  rounded-lg shadow-sm` (admin card, `App.jsx:4517`), mixed badge styles
  (`.stars-badge-ok` vs ad-hoc `px-2 py-0.5 rounded-full bg-gray-100 …`).

## 7. Unused or obsolete UI elements

- `openPotholeId` state (`App.jsx:177`) is written (`App.jsx:1463`) but never
  read — dead state from the removed per-route pothole panel.
- Stale comments: "Report pothole section will be rendered later in JSX"
  (`App.jsx:110`), "Hazards badge removed with avoidance feature"
  (`App.jsx:4203`), "Potholes option removed as requested" (`App.jsx:4210`).
- The sr-only-only route count (`App.jsx:4029`) is invisible to sighted users.
- Emergency has no section home — it exists only as a dock toggle + overlay.

## 8. Broken or nonfunctional controls

- No fully dead buttons found: every dock item, FAB and card button toggles
  real state; the camera FAB's `scrollIntoView` target exists on Navigate.
- The route-count announcement works for screen readers only (visibility gap,
  not breakage).
- Dialogs (admin PIN, reject, fix proof, image preview, camera) use
  `stars-dialog-overlay` + `role="dialog" aria-modal="true"` and Escape is
  wired (`App.jsx:1548`) — keyboard close works.
- `window._mapInstance` global is the map handle used by ~15 call sites
  (works, but fragile).

## Restructuring priorities (feeding Phases 2–12)

1. **One route-card surface**: single card component with stable identity;
   count shown once ("N routes available") above the list; map keeps a compact
   identifier. (Phases 3, 7)
2. **Contextual reporting**: hide `reportCardEl` from Navigate; open it from a
   single "Report Hazard" action as a dialog/drawer/bottom sheet. (Phase 4)
3. **One home per feature**: dock toggles keep only map-affecting layers;
   panels (prefs, what-if, analytics, voice) live in their section only.
   (Phases 2, 5, 9)
4. **Theme system**: add `darkMode: "class"`, a header sun/moon toggle,
   persisted preference, applied consistently. (Phase 6)
5. **Compact map controls**: merge the 5 FABs + chips so nothing covers the
   map on mobile. (Phase 5)
6. **Style cleanup**: replace remaining inline styles and stray card/badge
   idioms with `.stars-*`; delete dead state and stale comments. (Phases 6, 11)
