/**
 * P27 — performance assertions (static + bundle graph).
 *
 * Verifies the chart library (recharts) is out of the initial bundle and
 * that the memo/stable-handler wiring is present. Run after `npm run build`.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (tests/..)
const read = (p) => readFileSync(join(root, p), "utf8");

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
};

t("dist/index.html exists (build ran first)", () => {
  assert.ok(existsSync(join(root, "dist", "index.html")), "run npm run build before t27");
});

t("recharts chunk is NOT preloaded with the initial bundle", () => {
  const html = read("dist/index.html");
  assert.ok(!html.includes("vendor-charts"), "vendor-charts still modulepreloaded in index.html");
});

t("charts chunk still emitted as an async chunk", () => {
  const assets = readdirSync(join(root, "dist", "assets"));
  assert.ok(
    assets.some((f) => f.startsWith("vendor-charts-") && f.endsWith(".js")),
    `no vendor-charts chunk in dist/assets: ${assets.filter((f) => f.includes("charts")).join(",")}`
  );
});

t("core vendor chunks are still preloaded (no over-lazy regression)", () => {
  const html = read("dist/index.html");
  assert.ok(html.includes("vendor-react"), "react vendor chunk missing from index.html");
  assert.ok(html.includes("vendor-mapbox"), "mapbox vendor chunk missing from index.html");
});

t("App.jsx has no static recharts import", () => {
  const app = read("src/App.jsx");
  assert.ok(!/from\s+"recharts"/.test(app), "App.jsx still imports recharts directly");
  assert.ok(!app.includes("<LineChart"), "App.jsx still renders a chart inline");
});

t("App.jsx lazy-loads all three chart consumers", () => {
  const app = read("src/App.jsx");
  const lazyPaths = {
    AnalyticsPanel: "./features/community/AnalyticsPanel",
    PredictiveSafetyPanel: "./features/safety/PredictiveSafetyPanel",
    TrafficChart: "./features/routing/TrafficChart",
  };
  for (const [name, spec] of Object.entries(lazyPaths)) {
    assert.ok(
      app.includes(`React.lazy(() => import("${spec}"))`),
      `${name} is not lazy-imported in App.jsx (expected ${spec})`
    );
  }
  assert.ok(app.includes("<Suspense"), "Suspense boundaries missing in App.jsx");
});

t("heavy panels are memoized", () => {
  const memoFiles = {
    AnalyticsPanel: "src/features/community/AnalyticsPanel.jsx",
    PredictiveSafetyPanel: "src/features/safety/PredictiveSafetyPanel.jsx",
    TripsPanel: "src/features/community/TripsPanel.jsx",
  };
  for (const [f, path] of Object.entries(memoFiles)) {
    const src = read(path);
    assert.ok(src.includes(`export default memo(${f});`), `${f} not wrapped in React.memo`);
  }
});

t("panel handlers are stable (useCallback-wired)", () => {
  const app = read("src/App.jsx");
  assert.ok(app.includes("onClose={closeAnalytics}"), "AnalyticsPanel onClose not stable");
  assert.ok(app.includes("onClose={closePredictive}"), "PredictiveSafetyPanel onClose not stable");
  assert.ok(app.includes("onClose={closeTrips}"), "TripsPanel onClose not stable");
  assert.ok(app.includes("onClear={clearTrips}"), "TripsPanel onClear not stable");
});

t("persistTrips has a stable identity (useCallback in hook)", () => {
  const hook = read("src/hooks/useTripHistory.js");
  assert.ok(hook.includes("const persistTrips = useCallback("), "persistTrips not wrapped in useCallback");
});

console.log(`\n${passed} tests passed`);
