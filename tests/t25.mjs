/** P25 — confidence & evidence indicators tests. */
import assert from "node:assert/strict";
import { assessFactorConfidence, calculateTrafficRisk } from "./src/features/safety/safetyScore.js";
import { analyzeRoute } from "./src/features/routing/routeAnalysis.js";
import { tripSummary } from "./src/features/community/tripHistory.js";
import { computeSafetyAnalytics } from "./src/features/community/analytics.js";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
};

// --- assessFactorConfidence banding -------------------------------------------------

t("no factors → Insufficient Data", () => {
  const c = assessFactorConfidence({});
  assert.equal(c.level, "insufficient");
  assert.equal(c.label, "Insufficient Data");
  assert.equal(c.score, 0);
  assert.equal(c.availableFactors, 0);
  assert.equal(c.totalFactors, 7);
  assert.equal(c.reasons.length, 7);
  assert.ok(c.reasons.every((r) => r.startsWith("⚠")));
  assert.ok(c.color);
});

t("2/7 factors → Low band with 29% coverage", () => {
  const c = assessFactorConfidence({ traffic: 20, pothole: 30 });
  assert.equal(c.level, "low");
  assert.equal(c.availableFactors, 2);
  assert.equal(c.score, 29); // Math.round(2/7*100)
});

t("4/7 factors → Medium band", () => {
  const c = assessFactorConfidence({ traffic: 20, pothole: 30, weather: 10, time: 40 });
  assert.equal(c.level, "medium");
  assert.equal(c.availableFactors, 4);
  assert.equal(c.score, 57);
});

t("6/7 factors → High band", () => {
  const c = assessFactorConfidence({
    traffic: 20, pothole: 30, weather: 10, incident: 0, accident: 0, time: 40,
  });
  assert.equal(c.level, "high");
  assert.equal(c.availableFactors, 6);
  assert.equal(c.score, 86);
});

t("estimated available factor caps High at Medium", () => {
  const all = { traffic: 44, pothole: 20, weather: 10, incident: 0, accident: 0, time: 40, roadCondition: 5 };
  const c = assessFactorConfidence(all, { estimatedKeys: ["traffic"] });
  assert.equal(c.score, 100);
  assert.equal(c.availableFactors, 7);
  assert.equal(c.level, "medium"); // capped from high
  assert.ok(c.reasons.some((r) => r.includes("Traffic") && r.includes("estimated")));
});

t("estimated key that is actually unavailable does not cap", () => {
  const c = assessFactorConfidence(
    { pothole: 20, weather: 10, incident: 0, accident: 0, time: 40, roadCondition: 5 },
    { estimatedKeys: ["traffic"] }
  );
  assert.equal(c.level, "high"); // 6/7 and traffic missing → no estimate present
});

t("reasons list every weight key with ✓/⚠ markers", () => {
  const c = assessFactorConfidence({ traffic: 10, time: 50 });
  assert.equal(c.reasons.length, c.totalFactors);
  assert.ok(c.reasons.some((r) => r.includes("Traffic") && r.startsWith("✓")));
  assert.ok(c.reasons.some((r) => r.includes("Weather") && r.startsWith("⚠")));
  assert.ok(c.reasons.some((r) => r.includes("unavailable")));
});

t("custom weight table is honored", () => {
  const c = assessFactorConfidence({ a: 10 }, { weights: { a: 0.5, b: 0.5 } });
  assert.equal(c.totalFactors, 2);
  assert.equal(c.availableFactors, 1);
  assert.equal(c.level, "medium"); // 1/2 = 0.5 → medium
});

// --- analyzeRoute carries a confidence assessment -----------------------------------

const route = {
  distance: 2000,
  duration: 300,
  geometry: {
    type: "LineString",
    coordinates: [
      [77.5, 12.9],
      [77.51, 12.91],
    ],
  },
  legs: [{ steps: [{ distance: 1000, duration: 60 }, { distance: 1000, duration: 200 }] }],
};

t("analyzeRoute returns confidence for minimal context", () => {
  const a = analyzeRoute(route, 0, { reports: [], now: new Date("2026-01-05T10:00:00") });
  assert.ok(a.confidence, "confidence missing from analysis");
  assert.equal(a.confidence.totalFactors, 7);
  assert.equal(a.confidence.availableFactors, 4); // traffic(est)+pothole+roadCondition+time
  assert.equal(a.confidence.score, 57);
  assert.equal(a.confidence.level, "medium");
  assert.equal(a.confidence.reasons.length, 7);
  assert.ok(a.traffic.estimated, "step-speed traffic should be flagged estimated");
});

t("analyzeRoute caps confidence at Medium for estimated traffic at full coverage", () => {
  const a = analyzeRoute(route, 0, {
    reports: [],
    routeWeather: { 0: { points: [{ data: { weather: [{ main: "rain", description: "light rain" }] } }] } },
    incidentsByRoute: [],
    accidentsAvailable: true,
    now: new Date("2026-01-05T10:00:00"),
  });
  assert.equal(a.confidence.score, 100);
  assert.equal(a.confidence.availableFactors, 7);
  assert.equal(a.confidence.level, "medium"); // high capped because traffic estimated
  assert.ok(a.confidence.reasons.some((r) => r.includes("estimated")));
});

t("analyzeRoute reaches High with live (non-estimated) traffic", () => {
  const a = analyzeRoute(route, 0, {
    reports: [],
    trafficByRoute: { 0: { points: [{ delayPct: 25 }] } },
    routeWeather: { 0: { points: [{ data: { weather: [{ main: "rain", description: "light rain" }] } }] } },
    incidentsByRoute: [],
    accidentsAvailable: true,
    now: new Date("2026-01-05T10:00:00"),
  });
  assert.ok(Number.isFinite(calculateTrafficRisk({ avgDelayPct: 25 })));
  assert.equal(a.traffic.estimated, false);
  assert.equal(a.confidence.availableFactors, 7);
  assert.equal(a.confidence.level, "high");
});

// --- evidence: scored trips ---------------------------------------------------------

t("tripSummary reports scoredCount behind avgSafety", () => {
  const s = tripSummary([
    { endedAt: 1000, safetyScore: 80 },
    { endedAt: 2000, safetyScore: 60 },
    { endedAt: 3000 }, // ended, never scored
    { startedAt: 4000 }, // still active
  ]);
  assert.equal(s.tripCount, 4);
  assert.equal(s.scoredCount, 2);
  assert.equal(s.avgSafety, 70);
});

t("tripSummary with no trips → scoredCount 0, avgSafety null", () => {
  const s = tripSummary([]);
  assert.equal(s.scoredCount, 0);
  assert.equal(s.avgSafety, null);
  assert.equal(s.tripCount, 0);
});

t("analytics snapshot carries scoredCount through trips", () => {
  const snap = computeSafetyAnalytics({
    reports: [],
    trips: [{ endedAt: 1000, safetyScore: 50 }],
    now: 2000,
  });
  assert.equal(snap.trips.scoredCount, 1);
  assert.equal(snap.trips.tripCount, 1);
});

console.log(`\n${passed} tests passed`);
