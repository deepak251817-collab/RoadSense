# Report 3 — Verification Evidence

Date: 2026-10-10 · Verified after Phase 14 (final code state of the
consolidation effort; Phase 15 is documentation-only).

## 1. Automated suites — 13/13 passing

```
node tests/run-all.mjs   →  13/13 suites passed
```

Suites: `t21`–`t28`, `t33`–`t36` (also `npm test`). Coverage includes safety
scoring, route analysis, hazard clustering/lifecycle, incident parsing, HTTP
client caching/retries, voice phrasing, explainability, design-system CSS
rules, and autocomplete failure chains (`t28`, updated in Phase 12 for the
status-tracking contract).

## 2. Production build — green

```
npm run build  →  ✓ built (vite)
dist/assets/index-*.js        330.42 kB │ gzip:  91.49 kB
dist/assets/vendor-mapbox-*.js 1,663.01 kB │ gzip: 460.65 kB
```

Built CSS verified directly: all wired classes present
(`stars-badge-warn/neutral`, `stars-btn-danger`, `stars-skeleton`);
removed classes absent (0 matches).

## 3. Browser end-to-end (agent-browser, dev server on :5173)

| Flow | Result |
| --- | --- |
| Geocode autocomplete (origin + destination) | 3 suggestions each; pick works |
| Empty-search state (Phase 12) | "No matching places found…" hint appears for nonsense query |
| Find Routes | 2 routes with safety scores, recommendation, fastest delta |
| Details → Safety analysis | Confidence: Medium (5/7 factors), factor rows, evidence coverage |
| Recommendation card | Safety 57/100, "Why this route?", confidence chip |
| Directions | Step list rendered with maneuver text |
| Report form | "Review your report" step live-updates from typed description |
| Admin sign-in (demo PIN 1234) | Dialog submits; badge → Admin Mode |
| Municipal dashboard (admin) | Renders filters/summary/critical roads/priorities |
| Six-section navigation | All sections visit; console free of errors/warnings |

## 4. Responsive sweep

Breakpoints 320 / 768 / 1440 px × all six sections:

- 768 and 1440: **0 px horizontal overflow** everywhere.
- 320: only the 15 px vertical-scrollbar accounting; **no content overflow**
  after fixing the one real defect found (`d60546f`: route-card action strip
  overflowed 86 px once routes were loaded — visible only with data on screen).

## 5. Accessibility

- 43/43 buttons expose an accessible name; 0 unlabeled form inputs
  (description textarea and photo input got labels in Phase 11).
- Visible 2px focus outline; `prefers-reduced-motion` collapses animation.
- Breakpoint-fixed header verified; skip-to-content link present.

## 6. Known limitations

- Live third-party APIs (Mapbox, Nominatim, OpenWeather, Overpass) were
  exercised in-browser; availability and rate limits are outside this repo.
- Browser checks are agent-driven, not wired into CI; the 13 Node suites are
  the CI-able gate.
- Admin flows verified with the documented demo PIN only.
