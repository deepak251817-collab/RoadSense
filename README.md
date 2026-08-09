# STARS RouteFinder — UI Additions & Usage

This README documents the recent UI additions made to the STARS RouteFinder app: a full-screen map toggle, a floating action toolbar (FAB) for quick actions, and wiring to the existing pothole/reporting and map flows.

**Files changed**
- `src/App.jsx` — primary edits: added `fullMap` state, `sourceInputRef`, `destInputRef`, `reportCardRef`, full-screen toggle button, FAB markup and small plumbing to call existing handlers.

**Summary of new features**
- Full-screen map toggle: a button to switch the map between embedded layout and full-viewport mode.
- Floating Action Toolbar (FAB): bottom-right vertical cluster of circular icons that trigger:
  - Search: focuses the source/destination input.
  - My Location: centers the map on the user (geolocation).
  - Traffic: triggers traffic data fetch/update for the active route.
  - Weather: triggers weather sampling and displays weather markers along the route.
  - Report (Camera): opens the camera/upload modal and scrolls to the report card.

**How it was implemented (high level)**
- Edits were minimal and local to the front-end: changes in `src/App.jsx` only.
- The FAB buttons call existing handlers already present in the app:
  - `handleUseMyLocation()` — center map on user location.
  - `fetchTrafficForRoute(idx)` — update traffic overlays.
  - `fetchWeatherForRoute(idx)` — update weather markers.
  - `openCameraModal(mode)` and `captureFromCamera()` — camera and capture handling.
  - `persistReports(arr)` and `renderUserPotholeMarkers()` — save and show user reports.
- Mapbox map instance is reused (available as `window._mapInstance`) and is resized on full-screen toggle using `window._mapInstance?.resize()`.

**Image coordinate extraction**
- EXIF: `exifr.parse(file)` is used to extract GPS from uploaded images.
- OCR fallback: `tesseract.js` is used to attempt to read coordinates printed/overlaid on images when EXIF is missing (heuristic and not guaranteed).
- Camera geolocation: a `bestGeoRef` (geolocation watch) is used to capture better coordinates during camera capture.

**Data persistence**
- All report/pothole data remains client-side in `localStorage`.
  - Key examples: `userPotholeReports`, `adminMessages`.
- No backend changes were introduced; multi-user persistence requires a server or cloud store to be added separately.

**Environment variables**
- `VITE_MAPBOX_TOKEN` (required) — Mapbox access token for map tiles.
- `VITE_OPENWEATHER_KEY` (optional) — OpenWeather API key for weather sampling along routes.

**Run & verify (PowerShell)**
```powershell
npm install
npm run dev
```

Open the app at the Vite dev URL shown in the terminal and verify:
- Map loads correctly (ensure `VITE_MAPBOX_TOKEN` is provided).
- Top-right full-screen icon toggles the map to full viewport and back.
- FAB actions:
  - Search focuses the "From" input.
  - My Location requests geolocation permission and recenters the map.
  - Traffic updates traffic overlays (if route is present).
  - Weather displays weather markers along the route (if `VITE_OPENWEATHER_KEY` available).
  - Report opens the camera/upload modal; capture or upload an image and submit — marker should appear and `localStorage` should update.
- Admin flows (Fix/Reject) continue to work via existing modals.

**Troubleshooting**
- Blank map or tiles missing: confirm `VITE_MAPBOX_TOKEN` is set and valid.
- Camera not opening: browser permissions or secure origin (use `localhost` or HTTPS) required.
- EXIF not detected: many phone cameras remove EXIF when sharing; try original images or allow camera to geotag.
- OCR failures: OCR is heuristic; do not rely on OCR for critical coordinates.

**Next steps / recommendations**
- Run the app and test flows end-to-end. If multi-user persistence is needed, add a server API to store reports centrally.
- Consider UI feedback for long-running actions (OCR, large image uploads) and add optimistic UI updates for reports.

---
If you'd like, I can now run the dev server and walk through verification steps with expected console checks, or add a short `TESTING.md` that lists specific test cases to run manually or with automated tests.