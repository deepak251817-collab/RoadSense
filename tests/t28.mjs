// t28.mjs — P28: error handling & resilience guards (runs from app root, text-level assertions)
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

const app = readFileSync("src/App.jsx", "utf8");
const main = readFileSync("src/main.jsx", "utf8");
const eb = readFileSync("src/components/ErrorBoundary.jsx", "utf8");

console.log("ErrorBoundary component:");
ok(eb.includes("class ErrorBoundary extends React.Component"), "is a React class component");
ok(eb.includes("static getDerivedStateFromError"), "defines getDerivedStateFromError");
ok(eb.includes("componentDidCatch(error, info)"), "defines componentDidCatch");
ok(eb.includes('role="alert"'), "fallback uses role=\"alert\"");
ok(eb.includes("Try again") && eb.includes("Reload app"), "offers retry and reload actions");
ok(eb.includes("return this.props.children"), "renders children when no error");

console.log("main.jsx wiring:");
ok(main.includes('import ErrorBoundary from "./components/ErrorBoundary"'), "imports ErrorBoundary");
const wrapped = /<ErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/ErrorBoundary>/.test(main);
ok(wrapped, "<App /> is wrapped in <ErrorBoundary>");

console.log("App.jsx promise chain guards:");
const thenCount = (app.match(/\.then\(/g) || []).length;
const catchCount = (app.match(/\.catch\(/g) || []).length;
ok(catchCount >= thenCount, `every .then( is paired with .catch( (then=${thenCount}, catch=${catchCount})`);

// No bare chain: each .then( must have .catch( on its line or within the next 2 lines
let unguarded = [];
{
  const lines = app.split("\n");
  lines.forEach((line, i) => {
    if (!line.includes(".then(")) return;
    const window = [lines[i], lines[i + 1] || "", lines[i + 2] || ""].join("\n");
    if (!window.includes(".catch(")) unguarded.push(i + 1);
  });
}
ok(unguarded.length === 0, `no unguarded .then( chain${unguarded.length ? " at lines " + unguarded.join(", ") : ""}`);

ok(/fetchExternalIncidents\([\s\S]{0,120}\}\)\.catch\(/.test(app), "incidents feed chain has .catch fallback");
ok(/Notification\.requestPermission\(\)\.then\([\s\S]{0,80}\}\)\.catch\(/.test(app), "notification permission chain has .catch");
ok((app.match(/reverseGeocode\(coord\[0\], coord\[1\]\)\.catch\(\(\) => null\)\.then\(/g) || []).length === 4,
  "all 4 reverseGeocode call sites recover with .catch(() => null)");
ok((app.match(/geocode\((sourceQuery|destQuery|stopSearchQuery)\)\.catch\(\(\) => \[\]\)\.then\(/g) || []).length === 3,
  "all 3 autocomplete geocode chains recover with .catch(() => [])");
ok(/\.catch\(\(\) => \{ if \(!cancelled\) setRouteForecast\(null\); \}\)/.test(app),
  "route forecast chain keeps its .catch handler (no regression)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
