// t29.mjs — P29: accessibility & responsive guards (runs from app root, text-level assertions)
import { readFileSync, readdirSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

const app = readFileSync("src/App.jsx", "utf8");
const css = readFileSync("src/index.css", "utf8");
const html = readFileSync("index.html", "utf8");
// aria coverage spans App + every component file
const componentSrc = readdirSync("src/components")
  .filter((f) => f.endsWith(".jsx"))
  .map((f) => readFileSync(`src/components/${f}`, "utf8"))
  .join("\n");
const allJsx = app + "\n" + componentSrc;

console.log("Keyboard accessibility (Escape closes overlays):");
const escIdx = app.indexOf('e.key !== "Escape"');
ok(escIdx !== -1, "global Escape key handler exists");
const escBlock = escIdx !== -1 ? app.slice(escIdx, escIdx + 900) : "";
ok(escBlock.includes("imageModal.open"), "Escape closes image preview dialog");
ok(escBlock.includes("cameraOpen") && escBlock.includes("setCameraOpen(false)"), "Escape closes camera dialog");
ok(escBlock.includes("rejectModal.open"), "Escape closes reject-report dialog");
ok(escBlock.includes("fixModal.open"), "Escape closes fix-proof dialog");
ok(escBlock.includes("adminPinOpen") && escBlock.includes("setAdminPinOpen(false)"), "Escape closes admin sign-in dialog");
ok(escBlock.includes("showMessages") && escBlock.includes("setShowMessages(false)"), "Escape closes messages popover");
ok(escBlock.includes("layersMenuOpen"), "Escape closes map layers popover");
ok(escBlock.includes("showRoutePrefs"), "Escape closes route preferences dialog");
ok(escBlock.includes("fullMap"), "Escape exits full-map mode");
ok(escBlock.includes("pickingMode") && escBlock.includes("disableMapPick()"), "Escape cancels map picking");
ok(escBlock.includes('window.addEventListener("keydown"') && escBlock.includes('window.removeEventListener("keydown"'),
  "handler is registered and cleaned up");

console.log("Screen-reader announcements:");
ok(/role="status"[^>]*aria-live="polite"|role="status"[\s\S]{0,40}aria-live="polite"/.test(app),
  "polite live region for route search status");
ok(/routesLoading \? "Finding routes\.\.\."/.test(app), "announces 'Finding routes...' while searching");
ok(/routes\.length \? `\$\{routes\.length\} route/.test(app), "announces route count when results arrive");
ok(/\{notice && \(\s*\n\s*<div role="status"/.test(app), "notice banner has role=\"status\"");
ok(/\{mapError && \(\s*\n\s*<div role="alert"/.test(app), "map error banner has role=\"alert\"");
const labelCount = (allJsx.match(/aria-label=/g) || []).length;
ok(labelCount >= 40, `aria-label coverage retained across App + components (${labelCount} found)`);

console.log("Route search busy state:");
ok(/const \[routesLoading, setRoutesLoading\] = useState\(false\)/.test(app), "routesLoading state exists");
ok(app.includes("setRoutesLoading(true);") && app.includes("setRoutesLoading(false);"),
  "getRoutes sets and clears loading (try/finally)");
ok(/disabled=\{!sourceCoord \|\| !destCoord \|\| routesLoading\}/.test(app), "Find Routes disabled while loading");
ok(app.includes("aria-busy={routesLoading}"), "Find Routes exposes aria-busy");
ok(/\{routesLoading \? "Finding\.\.\." : "Find Routes"\}/.test(app), "button label reflects busy state");

console.log("Responsive & baseline regressions:");
ok(html.includes('name="viewport" content="width=device-width, initial-scale=1.0"'), "viewport meta present");
ok(/grid-cols-1 lg:grid-cols-3/.test(app), "main layout collapses to single column on small screens");
ok(/window\.addEventListener\("resize", onResize\)/.test(app) && /_mapInstance\?\.resize\(\)/.test(app),
  "map canvas re-syncs on viewport resize");
ok(css.includes(":focus-visible"), "visible keyboard focus styles retained");
ok(css.includes("prefers-reduced-motion"), "reduced-motion support retained");
ok(app.includes("Skip to main content"), "skip link retained");
const liveCount = (allJsx.match(/aria-live=/g) || []).length;
ok(liveCount >= 2, `aria-live regions present across App + components (${liveCount} found)`);
ok(app.includes('aria-live="polite"') && componentSrc.includes('aria-live="assertive"'),
  "both polite (route status) and assertive (hazard alerts) live regions exist");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
