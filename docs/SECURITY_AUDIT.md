# Security Audit — STARS V3 (Phase 33, final re-verification Phase 39)

Date: 2026-10-08 · Scope: repository hygiene, secrets, client-side injection
surface, dependency advisories, and runtime hardening.

**Rule observed throughout: no secret values are reproduced in this document,
the README, or any test.**

---

## 1. Secrets & repository hygiene

| Check | Result |
| --- | --- |
| `.env` tracked by git? | **No** — only `.env.example` is tracked |
| `.env` git-ignored? | **Yes** — `.gitignore` covers `.env`, `.env.local`, `.env.*.local` |
| `.env.example` values | **All empty placeholders** (`KEY=`) — credential-free |
| Secret-like literals in tracked source (`src/`, `index.html`, docs, lockfile) | **None found** (pattern scan for Mapbox `pk.~/sk.`, Google `AIza…`, 32-hex tokens) |
| Git history | `.env` **was committed once** in the initial import (`ec12578 "v1"`, 2026-08-10) |

**Action required (operational):** any Mapbox/OpenWeather key that ever lived
in that commit must be treated as compromised. Rotate it in the provider
dashboard and put the fresh key in the local, git-ignored `.env`. This notice
is duplicated in `.env.example` and README §7.

## 2. Client-side injection (XSS)

All `innerHTML` / `setHTML` sinks were reviewed:

| Sink | Input | Verdict |
| --- | --- | --- |
| Route hover box (App.jsx) | computed numbers only | Safe |
| Segment popup (App.jsx) | wraps every value in local `esc()` | Safe |
| Emergency service popups | every field via `escapePopupHtml()` (OSM data) | Safe |
| **Report marker popup** | description escaped, but **severity and type label were raw** | **Fixed** |

**Finding (fixed this phase):** the report popup interpolated
`String(rep.severity).toUpperCase()` and `hazardTypeMeta(rep.type).label`
directly into `innerHTML`. `hazardTypeMeta()` falls back to the *raw value*
for unknown types, so a report with a hostile `type`/`severity` string —
possible via a shared backend (`VITE_API_BASE_URL`) or corrupted localStorage —
would execute script when its popup opened (stored XSS). Both values are now
passed through `escapePopupHtml()` at the popup build site.

Other surfaces checked:

- `eval` / `new Function` / `dangerouslySetInnerHTML`: **none** in `src/`.
- `photoDataUrl` is assigned via `img.src` (property, not markup); images are
  produced by `canvas.toDataURL()` and only rendered in `<img>` contexts.
- External links use `rel="noreferrer"` (`target="_blank"` safe).
- Admin message/notice rendering goes through JSX (auto-escaped).

## 3. Network & runtime hardening

- **Single HTTP client** (`services/httpClient.js`): timeouts via
  `AbortController`, bounded retries on 5xx/429/network only (never 4xx),
  exponential backoff, short TTL cache (Nominatim-friendly).
- **No unhandled promise rejections**: every `.then(` chain in the app has a
  `.catch` fallback (asserted by suite t28).
- **Error boundary** wraps the app; render crashes show a retry/reload
  fallback instead of a blank page.
- **localStorage reads are defensive**: corrupt JSON falls back to defaults
  (backend repository mem-fallback, try/catch around every parse).
- **Admin gate** is client-side with default PIN `1234`. This is an
  obfuscation layer only — real authorization requires the optional backend;
  documented in README §14.

## 4. Dependency advisories (`npm audit`)

- **Production dependencies: 0 vulnerabilities** (after `npm audit fix`
  updated the lockfile within existing semver ranges).
- **Dev dependencies: 9 advisories (3 moderate, 6 high)** remain — all in the
  build toolchain and none shipped to users:
  - `braces` / `postcss-selector-parser` via `tailwindcss@3` — fixing requires
    Tailwind 4 (breaking, `--force`).
  - `esbuild` (Vite 5 dev server) — dev-server-only exposure; fixing requires
    a Vite major upgrade.
  - `@babel/core`, `baseline-browser-mapping`, `brace-expansion` — already
    auto-fixed where ranges allowed.

**Accepted risk:** dev toolchain advisories that only affect `npm run dev` /
`npm run build` on a developer machine. Remediation path: Vite 6+ and
Tailwind 4 upgrade in a future phase.

## 5. Data & privacy

- All user data lives in browser `localStorage`; nothing is uploaded unless
  the operator configures `VITE_API_BASE_URL`.
- No third-party analytics or tracking scripts are present.
- External requests only go to the documented providers (Mapbox, OpenWeather,
  Nominatim, Overpass, optional incident feed).

## 6. Residual recommendations (not blockers)

1. Rotate any historically committed API keys (operational — see §1).
2. Plan a Vite 6+/Tailwind 4 upgrade to clear the dev-toolchain advisories.
3. If multi-user mode is deployed, enforce authorization server-side; the
   client PIN is not a security boundary.
4. Consider a Content-Security-Policy meta tag if the app is ever hosted
   outside a trusted origin (needs testing against Mapbox blob workers).

## 7. Final sign-off (Phase 39)

Re-verified against the release tree (`e4a2e3d`):

- `.env` is git-ignored and untracked; `.env.example` contains only empty
  placeholders plus the rotation notice.
- No credential-shaped strings (API key / token / secret / password literals)
  in any tracked file; README contains no keys; no `pk.ey…` token shapes
  outside the documented audit history.
- No `eval` / `new Function` in `src/`; the remaining `innerHTML` sinks were
  fixed in Phase 33 and escape all user-derived strings.
- `npm audit --omit=dev` → **0 vulnerabilities**. The dev-only toolchain
  advisories (Vite/Tailwind majors) remain accepted per §4/§6.
- **Rotation of historically committed keys remains required** — this is an
  operational step outside the repository and cannot be closed by code.
