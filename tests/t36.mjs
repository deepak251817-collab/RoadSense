// Part A audit fixes — what-if simulated conditions (traffic/rain/visibility)
// and recommendation-level avoidance preferences. Module suite.
import { strict as assert } from "node:assert";

import {
  runWhatIf,
  normalizeWhatIfAdjustments,
  hasWhatIfAdjustments,
  WHAT_IF_TRAFFIC_STEPS,
  WHAT_IF_RAIN_LEVELS,
  WHAT_IF_VISIBILITY_LEVELS,
  WHAT_IF_REDUCED_VISIBILITY_RISK,
} from "./src/features/routing/whatIf.js";
import {
  applyAvoidPreferences,
  normalizeRoutePreferences,
  buildExcludeParam,
  DEFAULT_ROUTE_PREFERENCES,
  ROUTE_AVOIDANCES,
} from "./src/features/routing/routePreferences.js";
import {
  collectRouteReports,
  analyzeRoute,
} from "./src/features/routing/routeAnalysis.js";

let passed = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });

const HOUR = 3600 * 1000;
const NOW = 1_700_000_000_000;

const ROUTE = {
  distance: 2200,
  duration: 600,
  geometry: {
    coordinates: Array.from({ length: 13 }, (_, i) => [77.6 + (i * 0.02) / 12, 12.97]),
  },
};

function report(over = {}) {
  return {
    id: over.id ?? 1,
    coord: [77.61, 12.9701],
    severity: "moderate",
    type: "pothole",
    status: "reported",
    createdAt: NOW - 2 * HOUR,
    description: "test",
    hiddenGlobally: false,
    hiddenForUser: false,
    ...over,
  };
}

// ===========================================================================
// normalizeWhatIfAdjustments
// ===========================================================================

test("adjustments: normalizer accepts presets and rejects garbage", () => {
  assert.deepEqual(WHAT_IF_TRAFFIC_STEPS, [0, 25, 50]);
  assert.deepEqual(normalizeWhatIfAdjustments(), { trafficPct: 0, rain: "none", visibility: "normal" });
  assert.deepEqual(normalizeWhatIfAdjustments(null), { trafficPct: 0, rain: "none", visibility: "normal" });
  assert.deepEqual(normalizeWhatIfAdjustments({ trafficPct: 999, rain: "monsoon", visibility: "x" }),
    { trafficPct: 0, rain: "none", visibility: "normal" }, "invalid values fall back to neutral");
  assert.deepEqual(normalizeWhatIfAdjustments({ trafficPct: "50", rain: "heavy", visibility: "reduced" }),
    { trafficPct: 50, rain: "heavy", visibility: "reduced" });
  assert.equal(hasWhatIfAdjustments(null), false);
  assert.equal(hasWhatIfAdjustments({ trafficPct: 25 }), true);
  assert.equal(WHAT_IF_RAIN_LEVELS.length, 3);
  assert.equal(WHAT_IF_VISIBILITY_LEVELS.length, 2);
});

// ===========================================================================
// runWhatIf with simulated conditions
// ===========================================================================

test("what-if: traffic increase scales the baseline traffic factor", () => {
  // No hazards to repair, so the ONLY difference between before/after is
  // the simulated traffic increase — the score can only drop.
  const sim = runWhatIf({
    reports: [],
    route: ROUTE,
    baselineFactorRisks: { traffic: 40, weather: null, time: 30 },
    mode: "all",
    adjustments: { trafficPct: 50 },
    now: NOW,
  });
  assert.equal(sim.adjustments.trafficPct, 50);
  assert.ok(sim.adjustmentReasons.some((r) => r.includes("+50%") && r.includes("40 → 60")),
    `traffic 40 → 60 explained, got: ${sim.adjustmentReasons.join(" | ")}`);
  assert.ok(sim.simulated.route.score <= sim.baseline.route.score,
    "higher traffic can only lower or keep the simulated score");
});

test("what-if: traffic increase is skipped honestly when no baseline exists", () => {
  const sim = runWhatIf({
    reports: [report()],
    route: ROUTE,
    baselineFactorRisks: { traffic: null, time: 30 },
    adjustments: { trafficPct: 25 },
    now: NOW,
  });
  assert.ok(sim.adjustmentReasons.some((r) => r.startsWith("⚠") && r.includes("Traffic increase skipped")),
    "no baseline traffic → skipped with a warning, never invented");
});

test("what-if: rain and visibility set the simulated weather factor", () => {
  const moderate = runWhatIf({
    reports: [report()],
    route: ROUTE,
    baselineFactorRisks: { traffic: 20, weather: 10, time: 30 },
    adjustments: { rain: "moderate" },
    now: NOW,
  });
  assert.ok(moderate.adjustmentReasons.some((r) => r.includes("moderate rain") && r.includes("60")),
    "moderate rain uses the documented rainfall table (5 mm ⇒ 60)");

  const heavy = runWhatIf({
    reports: [],
    route: ROUTE,
    baselineFactorRisks: { weather: 10 },
    adjustments: { rain: "heavy" },
    now: NOW,
  });
  assert.ok(heavy.adjustmentReasons.some((r) => r.includes("heavy rain") && r.includes("85")),
    "heavy rain ⇒ 85");

  const reduced = runWhatIf({
    reports: [],
    route: ROUTE,
    baselineFactorRisks: { weather: 10 },
    adjustments: { visibility: "reduced" },
    now: NOW,
  });
  assert.ok(reduced.adjustmentReasons.some((r) => r.includes("reduced visibility") &&
    r.includes(String(WHAT_IF_REDUCED_VISIBILITY_RISK))),
    "reduced visibility applies the documented rule-based assumption");
  assert.ok(reduced.simulated.route.score < reduced.baseline.route.score,
    "worse simulated conditions lower the simulated score");
});

test("what-if: adjusted factors are no longer listed as held unchanged", () => {
  const sim = runWhatIf({
    reports: [report()],
    route: ROUTE,
    baselineFactorRisks: { traffic: 40, weather: 10, incident: 20, time: 30 },
    adjustments: { trafficPct: 25, rain: "moderate" },
    now: NOW,
  });
  assert.ok(!sim.unchanged.includes("traffic"), "adjusted traffic removed from unchanged list");
  assert.ok(!sim.unchanged.includes("weather"), "adjusted weather removed from unchanged list");
  assert.ok(sim.unchanged.includes("incident"), "unadjusted factors still held at baseline");
  assert.ok(sim.reasons.some((r) => r.includes("Hypothetical only")), "simulation caveat kept");
  assert.equal(sim.label, "Scenario Simulation");
});

test("what-if: neutral adjustments behave exactly like before (regression)", () => {
  const sim = runWhatIf({
    reports: [report()],
    route: ROUTE,
    baselineFactorRisks: { traffic: 40, weather: 10, time: 30 },
    mode: "all",
    now: NOW,
  });
  assert.deepEqual(sim.adjustments, { trafficPct: 0, rain: "none", visibility: "normal" });
  assert.deepEqual(sim.adjustmentReasons, [], "no adjustment reasons when neutral");
  assert.ok(sim.unchanged.includes("traffic") && sim.unchanged.includes("weather"),
    "neutral run holds everything unchanged");
});

// ===========================================================================
// Recommendation-level avoidance
// ===========================================================================

function analysis(over = {}) {
  return {
    index: over.index ?? 0,
    score: 70,
    durationSeconds: 600,
    classification: { key: "moderate", label: "Moderate" },
    potholes: { count: 0, highCount: 0, fixedCount: 0 },
    waterlogging: { count: 0 },
    incidents: { available: false, count: 0 },
    ...over,
  };
}

test("avoid: each toggle drops only the routes matching its rule", () => {
  const routes = [
    analysis({ index: 0 }), // clean
    analysis({ index: 1, classification: { key: "high-risk", label: "High Risk" } }),
    analysis({ index: 2, potholes: { count: 2, highCount: 1, fixedCount: 0 } }),
    analysis({ index: 3, waterlogging: { count: 1 } }),
    analysis({ index: 4, incidents: { available: true, count: 2 } }),
  ];
  const hr = applyAvoidPreferences(routes, { avoidHighRiskRoutes: true });
  assert.deepEqual(hr.list.map((a) => a.index), [0, 2, 3, 4]);
  assert.equal(hr.dropped, 1);
  assert.equal(hr.allDropped, false);

  const sev = applyAvoidPreferences(routes, { avoidSevereHazards: true });
  assert.deepEqual(sev.list.map((a) => a.index), [0, 1, 3, 4]);

  const wl = applyAvoidPreferences(routes, { avoidWaterlogging: true });
  assert.deepEqual(wl.list.map((a) => a.index), [0, 1, 2, 4]);

  const inc = applyAvoidPreferences(routes, { avoidIncidents: true });
  assert.deepEqual(inc.list.map((a) => a.index), [0, 1, 2, 3]);
});

test("avoid: unavailable incident feed never drops routes", () => {
  const routes = [
    analysis({ index: 0, incidents: { available: false, count: 0 } }),
    analysis({ index: 1, incidents: { available: false, count: 0 } }),
  ];
  const out = applyAvoidPreferences(routes, { avoidIncidents: true });
  assert.equal(out.list.length, 2, "no feed → nothing to avoid");
});

test("avoid: never drops every alternative", () => {
  const allHighRisk = [
    analysis({ index: 0, classification: { key: "risky", label: "Risky" } }),
    analysis({ index: 1, classification: { key: "high-risk", label: "High Risk" } }),
  ];
  const out = applyAvoidPreferences(allHighRisk, { avoidHighRiskRoutes: true });
  assert.equal(out.allDropped, true);
  assert.equal(out.list.length, 2, "falls back to the full list — a recommendation always exists");
  assert.deepEqual(applyAvoidPreferences([], { avoidIncidents: true }),
    { list: [], dropped: 0, allDropped: false }, "empty input tolerated");
  assert.deepEqual(applyAvoidPreferences(null, {}), { list: [], dropped: 0, allDropped: false });
});

test("avoid: preferences normalize with the four new toggles", () => {
  const defaults = normalizeRoutePreferences(null);
  for (const a of ROUTE_AVOIDANCES) {
    assert.equal(defaults[a.key], false, `${a.key} defaults off`);
    assert.ok(a.label && a.hint, "each avoidance carries a label and hint");
  }
  const raw = normalizeRoutePreferences({ avoidWaterlogging: "yes", avoidTolls: 1, bogus: true });
  assert.equal(raw.avoidWaterlogging, true);
  assert.equal(raw.avoidTolls, true);
  assert.equal(raw.avoidHighRiskRoutes, false);
  assert.equal(raw.avoidIncidents, false);
  assert.equal(DEFAULT_ROUTE_PREFERENCES.priority, "balanced");
  // New toggles must not leak into the Mapbox exclude param
  assert.equal(buildExcludeParam({ avoidWaterlogging: true, avoidIncidents: true }), null);
  assert.equal(buildExcludeParam({ avoidUnpaved: true, avoidTolls: true }), "unpaved,toll");
});

// ===========================================================================
// Waterlogging exposure per route (feeds the avoid-waterlogging rule)
// ===========================================================================

test("route analysis: counts active waterlogging reports near the route", () => {
  const reports = [
    report({ id: 1, type: "waterlogging" }),
    report({ id: 2, type: "waterlogging", status: "fixed" }), // fixed → excluded
    report({ id: 3, type: "pothole" }),
    report({ id: 4, type: "waterlogging", coord: [10, 10] }), // far away → excluded
  ];
  const near = collectRouteReports(ROUTE, reports, { showFixed: true });
  assert.equal(near.activeWaterloggingCount, 1, "only the active, nearby waterlogging report counts");

  const analysis0 = analyzeRoute(ROUTE, 0, { reports, now: new Date(NOW) });
  assert.equal(analysis0.waterlogging.count, 1, "analysis exposes the waterlogging count");
  const clean = analyzeRoute(ROUTE, 0, { reports: [], now: new Date(NOW) });
  assert.equal(clean.waterlogging.count, 0);
});

// ===========================================================================
// Runner
// ===========================================================================
let failures = 0;
for (const { name, fn } of queue) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${String((err && err.message) || err).split("\n")[0]}`);
  }
}
console.log(`\nt36: ${passed}/${queue.length} passed`);
if (failures) process.exit(1);
