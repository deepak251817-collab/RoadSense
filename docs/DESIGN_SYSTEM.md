# STARS Design System

Single source of truth for STARS' visual language (Phase 6 of the
restructuring prompt). Components consume these tokens; one-off styling is
a defect, not a variation.

## Foundations (`tailwind.config.js`)

| Token | Value | Use |
| --- | --- | --- |
| `primary` | indigo scale (50–950) | brand, navigation actions, links, focus rings |
| `shadow-card` | subtle 2-layer elevation | cards, panels |
| `shadow-pop` | 6px pop | popovers, dock |
| `shadow-modal` | 10px modal lift | dialogs |
| `rounded-card` | 12px | cards, panels, dialogs |
| `rounded-control` | 8px | buttons, inputs, chips, badges |
| font | Inter, sans-serif | all UI text |
| transition | 150ms default | hover/state changes only |

## Semantic safety colors (`state.*`)

Purposeful color only — **never color alone**: every state pairs with a
text label or icon.

| State | Meaning | Light | Dark |
| --- | --- | --- | --- |
| `state-ok` | safe / verified / healthy | `#15803d` | `#4ade80` |
| `state-warn` | moderate / caution / degraded | `#b45309` | `#fbbf24` |
| `state-danger` | risky / critical / hazardous | `#b91c1c` | `#f87171` |
| `state-info` | informational / estimate / simulation | `#1d4ed8` | `#60a5fa` |
| `state-neutral` | no data / disabled / inactive | `#4b5563` | `#9ca3af` |

Risk classification labels (Safe / Moderate / Risky) come from
`features/safety/safetyScore.js` — the single scoring engine; UI never
invents its own severity palette.

## Shared classes (`src/index.css`, `@layer components`)

| Class | Purpose |
| --- | --- |
| `.stars-card` / `.stars-card-pad` | surface containers |
| `.stars-h1` `.stars-h2` `.stars-h3` `.stars-display` `.stars-num` | type scale (headings, big numbers) |
| `.stars-caption` / `.stars-divider` | supporting text / separators |
| `.stars-btn` + `-primary` `-secondary` `-ghost` `-danger` | button ladder (one primary action per view) |
| `.stars-input` / `.stars-label` | form fields |
| `.stars-badge` + `-ok` `-warn` `-danger` `-info` `-neutral` | status labels (always with text) |
| `.stars-note` + `-info` `-warn` | inline notices |
| `.stars-seg` / `.stars-seg-item` | segmented switcher (map style) |
| `.stars-skeleton` | loading placeholders |
| `.stars-dialog-overlay` / `.stars-dialog-backdrop` / `.stars-dialog` | dialog shells (add `max-w-*` for width) |
| `.stars-empty` | empty-state copy |
| `[data-tip]` tooltips (CSS) | hover/focus tips for icon-only controls |

## Rules

1. **Map-first.** Chrome stays quiet; the map is the dominant surface.
2. **Neutral surfaces.** White/gray cards, restrained shadows — no gradients,
   glassmorphism, glow, or hover-scale effects.
3. **One primary action per view** (`.stars-btn-primary`); everything else
   secondary/ghost.
4. **Severity is labeled**, never communicated by color alone.
5. **Motion only answers the user** (open/close/confirm); no ambient
   animation; `prefers-reduced-motion` respected via Tailwind's motion-safe
   utilities where animated.
6. **Empty states use `.stars-empty`** and say what to do next.
7. **Dialogs use the shell classes** — no hand-rolled overlay markup.
8. Type: sentence case, no all-caps labels except table headers and small
   metadata where tracking already exists.
