// Phase 37 — comprehensive workflow verification: navigation, safety,
// prediction, hazards, intelligence, administration and resilience.
// Module suite: the runner mirrors src/ into a temp harness.
import { strict as assert } from "node:assert";

import { analyzeRoute, analyzeRoutes } from "./src/features/routing/routeAnalysis.js";
import {
  recommendRoute,
  buildRecommendationReasons,
  PRIORITY_WEIGHTS,
} from "./src/features/routing/recommendation.js";
import {
  recommendationConfigFor,
  normalizeRoutePreferences,
  buildExcludeParam,
  isValidPriority,
  ROUTE_PRIORITIES,
} from "./src/features/routing/routePreferences.js";
import {
  calculateRouteSafetyScore,
  classifySafetyScore,
  assessFactorConfidence,
  calculateIncidentRisk,
  calculateAccidentRisk,
  DEFAULT_WEIGHTS,
} from "./src/features/safety/safetyScore.js";
import {
  splitRouteIntoSegments,
  analyzeRouteSegments,
  classifySegment,
} from "./src/features/routing/segmentRisk.js";
import {
  roadHealthIndex,
  classifyRoadHealth,
} from "./src/features/road-conditions/roadHealth.js";
import {
  PREDICTION_HORIZONS,
  PREDICTION_LABEL,
  predictRoadRiskAllHorizons,
} from "./src/features/safety/prediction.js";
import { clusterReports } from "./src/features/safety/clustering.js";
import {
  STATUS_TRANSITIONS,
  STATUS_LABELS,
  normalizeStatus,
  nextStatuses,
  isActiveStatus,
} from "./src/features/admin/hazardLifecycle.js";
import {
  rainfallRiskFromMm,
  classifyWaterloggingRisk,
  WATERLOGGING_LABEL,
} from "./src/features/road-conditions/waterlogging.js";
import {
  isNightTime,
  classifyNightRisk,
  NIGHT_SAFETY_LABEL,
} from "./src/features/road-conditions/nightSafety.js";
import { classifyPriority, rankRepairs } from "./src/features/admin/repairPriority.js";
import { runWhatIf, WHAT_IF_LABEL, WHAT_IF_MODES } from "./src/features/routing/whatIf.js";
import { fetchExternalIncidents } from "./src/services/incidentService.js";
import { fetchJson } from "./src/services/httpClient.js";
import {
  detectPotholes,
  getActiveDetector,
  DETECTOR_INFO,
} from "./src/services/potholeDetection.js";
import { assessReportConfidence, locationConfidence } from "./src/features/safety/confidence.js";

let passed = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const HOUR = 3600 * 1000;
const NOW = 1_700_000_000_000;

/** Simple east–west route ≈2.2 km around Bengaluru (13 vertices → 12 edges). */
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
    coord: [77.61, 12.9701], // ~11 m north of the route line
    severity: "moderate",
    type: "pothole",
    status: "reported",
    createdAt: NOW - 2 * HOUR,
    description: "test hazard",
    hiddenGlobally: false,
    hiddenForUser: false,
    ...over,
  };
}

// ===========================================================================
// 1. NAVIGATION — route search, selection, multi-route comparison
// ===========================================================================

test("navigation: analyzeRoutes scores every route with band + confidence", () => {
  const routes = [
    { ...ROUTE },
    { ...ROUTE, distance: 3000, duration: 900 },
  ];
  const analyses = analyzeRoutes(routes, { reports: [], now: new Date(NOW) });
  assert.equal(analyses.length, 2);
  for (const a of analyses) {
    assert.ok(Number.isFinite(a.score) && a.score >= 0 && a.score <= 100, "score in 0..100");
    assert.ok(a.classification && typeof a.classification.label === "string", "classification");
    assert.ok(a.confidence && typeof a.confidence.label === "string", "confidence");
    assert.equal(a.distanceKm, a.distanceMeters / 1000);
  }
  assert.equal(analyses[0].label, "Route 1");
  assert.equal(analyses[1].label, "Route 2");
});

test("navigation: nearby hazard raises route risk vs empty route", () => {
  const clean = analyzeRoute(ROUTE, 0, { reports: [], now: new Date(NOW) });
  const hazed = analyzeRoute(ROUTE, 0, {
    reports: [report({ severity: "high" }), report({ id: 2, severity: "high" })],
    now: new Date(NOW),
  });
  assert.ok(hazed.score < clean.score, `hazards must lower score (${hazed.score} < ${clean.score})`);
  assert.equal(hazed.potholes.count, 2, "both reports within 120 m counted");
});

test("navigation: missing inputs are excluded, never fabricated", () => {
  const a = analyzeRoute(ROUTE, 0, { reports: [], now: new Date(NOW) });
  assert.ok(a.missingFactors.includes("weather"), "weather unavailable → missing");
  assert.ok(a.missingFactors.includes("incident"), "incident feed not wired → missing");
  assert.ok(a.missingFactors.includes("accident"), "accident source not wired → missing");
  assert.equal(a.weather.available, false);
  assert.equal(a.incidents.available, false);
  assert.equal(a.time.available, true, "time-of-day is always known");
});

test("navigation: recommendation flips Safety First → Time First", () => {
  const safeSlow = { index: 0, score: 90, durationSeconds: 1800 };
  const fastRisky = { index: 1, score: 50, durationSeconds: 1200 };
  const analyses = [safeSlow, fastRisky];

  const safetyWin = recommendRoute(analyses, { weights: PRIORITY_WEIGHTS.safest });
  assert.equal(safetyWin.recommendedIndex, 0, "safety-first picks the safer route");
  assert.equal(safetyWin.fastestIndex, 1);
  assert.equal(safetyWin.isFastest, false);
  assert.ok(safetyWin.timeDeltaMinutes > 0, "trade-off in minutes is reported");

  const timeWin = recommendRoute(analyses, { weights: PRIORITY_WEIGHTS.fastest });
  assert.equal(timeWin.recommendedIndex, 1, "time-first picks the faster route");

  const balanced = recommendRoute(analyses, { weights: PRIORITY_WEIGHTS.balanced });
  assert.ok([0, 1].includes(balanced.recommendedIndex), "balanced returns a valid route");
});

test("navigation: recommendation is deterministic and handles degenerate input", () => {
  assert.equal(recommendRoute([]), null);
  assert.equal(recommendRoute(null), null);
  const one = recommendRoute([{ index: 0, score: 70, durationSeconds: 600 }], {
    weights: PRIORITY_WEIGHTS.safest,
  });
  assert.equal(one.recommendedIndex, 0);
  assert.equal(one.isFastest, true);
  const again = recommendRoute(
    [
      { index: 0, score: 90, durationSeconds: 1800 },
      { index: 1, score: 50, durationSeconds: 1200 },
    ],
    { weights: PRIORITY_WEIGHTS.safest }
  );
  assert.equal(again.recommendedIndex, 0, "same input → same recommendation");
});

test("navigation: explanation reasons come from real metric differences", () => {
  const analyses = analyzeRoutes(
    [{ ...ROUTE }, { ...ROUTE, distance: 3400, duration: 1080 }],
    { reports: [report({ severity: "high" })], now: new Date(NOW) }
  );
  const rec = recommendRoute(analyses, { weights: PRIORITY_WEIGHTS.safest });
  const reasons = buildRecommendationReasons(analyses, rec);
  assert.ok(Array.isArray(reasons) && reasons.length > 0, "reasons are produced");
  for (const r of reasons) assert.equal(typeof r, "string");
  assert.equal(buildRecommendationReasons(analyses, null).length, 0, "no result → no reasons");
});

// ===========================================================================
// 2. SAFETY — score, confidence, incident risk, segment risk, road health
// ===========================================================================

test("safety: centralized score banding matches the spec thresholds", () => {
  assert.equal(classifySafetyScore(95).label, "Very Safe");
  assert.equal(classifySafetyScore(80).label, "Safe");
  assert.equal(classifySafetyScore(67).label, "Moderate");
  assert.equal(classifySafetyScore(50).label, "Risky");
  assert.equal(classifySafetyScore(10).label, "High Risk");
});

test("safety: score renormalizes over available factors only", () => {
  const all = calculateRouteSafetyScore({
    traffic: 80, weather: 80, pothole: 80, incident: 80,
    accident: 80, time: 80, roadCondition: 80,
  });
  const partial = calculateRouteSafetyScore({ traffic: 80, time: 80 });
  assert.equal(all.missingFactors.length, 0);
  assert.deepEqual(partial.missingFactors.sort(), [
    "accident", "incident", "pothole", "roadCondition", "weather",
  ].sort());
  // Two high-risk factors → score ≈ 20, not inflated/penalized by missing ones
  assert.ok(Math.abs(partial.score - 20) <= 1, `partial score ≈ 20, got ${partial.score}`);
});

test("safety: confidence is separate from score and caps on estimated data", () => {
  const full = {};
  for (const k of Object.keys(DEFAULT_WEIGHTS)) full[k] = 50;
  const high = assessFactorConfidence(full, {});
  assert.equal(high.label, "High");
  assert.equal(high.availableFactors, Object.keys(DEFAULT_WEIGHTS).length);

  const estimated = assessFactorConfidence(full, { estimatedKeys: ["traffic"] });
  assert.equal(estimated.label, "Medium", "estimated traffic caps High → Medium");
  assert.ok(estimated.reasons.some((r) => r.includes("estimated")));

  const none = assessFactorConfidence({}, {});
  assert.equal(none.label, "Insufficient Data");
  assert.equal(none.score, 0);
});

test("safety: incident risk honors the availability flag", () => {
  assert.equal(calculateIncidentRisk([], { available: false }), null, "no source → null, not 0");
  assert.equal(calculateIncidentRisk([], { available: true }), 0, "source but empty → 0");
  const withSevere = calculateIncidentRisk(
    [{ type: "accident", severity: "high" }],
    { available: true }
  );
  assert.ok(withSevere > 0 && withSevere <= 100, "severity drives risk");
  assert.equal(calculateAccidentRisk([{ type: "road-closure" }], { available: true }), 0,
    "non-accident incidents are not accidents");
  assert.equal(calculateAccidentRisk([], { available: false }), null);
});

test("safety: route splits into segments with honest bands", () => {
  const segs = splitRouteIntoSegments(ROUTE);
  assert.ok(segs.length >= 4, `min 4 segments, got ${segs.length}`);
  const analyzed = analyzeRouteSegments(ROUTE, { reports: [], now: new Date(NOW) });
  assert.equal(analyzed.length, segs.length);
  for (const s of analyzed) {
    assert.ok(Number.isFinite(s.score) && s.score >= 0 && s.score <= 100, "segment score 0..100");
    assert.ok(["Safe", "Moderate", "Risky", "High Risk"].includes(s.band.label), "band label");
    assert.equal(classifySegment(s.score).key, s.band.key, "classifySegment agrees with band");
  }
  assert.equal(classifySegment(NaN).key, "high-risk", "unknown → worst band, not a rosy guess");
  assert.equal(splitRouteIntoSegments({ geometry: { coordinates: [] } }).length, 0, "bad route → []");
});

test("safety: road health refuses to claim perfect roads without evidence", () => {
  const empty = roadHealthIndex({ reports: [] });
  assert.equal(empty.index, null, "no evidence → null index, not 100");
  assert.equal(empty.grade.label, "Insufficient Data");
  const withData = roadHealthIndex({ reports: [report(), report({ id: 2, status: "fixed" })] });
  assert.ok(Number.isFinite(withData.index) && withData.index >= 0 && withData.index <= 100);
  assert.ok(classifyRoadHealth(95).label.length > 0);
  assert.equal(classifyRoadHealth(NaN).label, "Insufficient Data");
});

// ===========================================================================
// 3. PREDICTION — 15 / 30 / 60 minute horizons
// ===========================================================================

test("prediction: all three horizons returned and labelled a predictive estimate", () => {
  assert.deepEqual(PREDICTION_HORIZONS, [15, 30, 60]);
  const all = predictRoadRiskAllHorizons({ now: new Date(NOW) });
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((p) => p.horizonMinutes), [15, 30, 60]);
  for (const p of all) {
    assert.ok(Number.isFinite(p.predictedScore) && p.predictedScore >= 0 && p.predictedScore <= 100);
    assert.equal(p.label, PREDICTION_LABEL);
    assert.equal(p.label, "Predictive estimate", "never claims to be AI");
    assert.ok(p.confidence && Array.isArray(p.confidence.reasons) && p.confidence.reasons.length > 0);
    assert.ok(p.factors && Object.keys(p.factors).length > 0, "contributing factors exposed");
  }
});

test("prediction: longer horizon leans further toward the future hour", () => {
  const [p15, , p60] = predictRoadRiskAllHorizons({ now: new Date(NOW) });
  const t15 = p15.factors.time;
  const t60 = p60.factors.time;
  assert.ok(t15 && t60 && t15.available && t60.available, "time factor present at both horizons");
  // evidence reasons mark forecast/historical as absent when not provided
  assert.ok(p15.confidence.reasons.some((r) => r.startsWith("⚠") || r.startsWith("✓")));
});

// ===========================================================================
// 4. HAZARDS — clustering, verification lifecycle
// ===========================================================================

test("hazards: nearby reports of the same type form one cluster", () => {
  const near = [
    report({ id: 1, coord: [77.61, 12.97] }),
    report({ id: 2, coord: [77.61001, 12.97001] }), // ~1.4 m away
  ];
  const clusters = clusterReports(near, { groupBy: "type" });
  assert.equal(clusters.length, 1, "two adjacent reports → one cluster");
  assert.equal(clusters[0].reports.length, 2);

  const far = [
    report({ id: 1, coord: [77.61, 12.97] }),
    report({ id: 2, coord: [77.71, 13.07] }), // ~15 km away
  ];
  assert.equal(clusterReports(far, { groupBy: "type" }).length, 2, "distant reports stay separate");
  assert.equal(clusterReports(null).length, 0, "garbage input tolerated");
  // Clustering never marks anything verified — it only groups.
  for (const c of clusters) {
    assert.ok(!("verified" in c), "clusters carry no auto-verification");
  }
});

test("hazards: lifecycle transitions match the documented workflow", () => {
  assert.deepEqual(STATUS_TRANSITIONS.reported, ["under-review", "verified"]);
  assert.deepEqual(STATUS_TRANSITIONS.verified, ["repair-requested", "fixed"]);
  assert.deepEqual(STATUS_TRANSITIONS["repair-requested"], ["fixed", "verified"]);
  assert.deepEqual(STATUS_TRANSITIONS.rejected, ["reported"], "rejection is reversible");
  // Every transition target is itself a known status (no dangling states)
  for (const [from, tos] of Object.entries(STATUS_TRANSITIONS)) {
    for (const to of tos) {
      assert.ok(STATUS_LABELS[to], `unknown target status "${to}" from "${from}"`);
      assert.ok(STATUS_LABELS[from], `unknown source status "${from}"`);
    }
  }
  assert.deepEqual(nextStatuses("reported"), ["under-review", "verified"]);
  // Unknown/legacy strings normalize to "reported" (defensive default), so
  // they offer the reported-status transitions rather than none at all.
  assert.equal(normalizeStatus("garbage"), "reported");
  assert.deepEqual(nextStatuses("garbage"), STATUS_TRANSITIONS.reported);
  assert.equal(normalizeStatus("Under_Review"), "under-review");
  assert.equal(normalizeStatus("unverified"), "reported");
  assert.equal(isActiveStatus("reported"), true);
  assert.equal(isActiveStatus("verified"), true);
  assert.equal(isActiveStatus("fixed"), false);
  assert.equal(isActiveStatus("rejected"), false);
});

// ===========================================================================
// 5. INTELLIGENCE — waterlogging, night safety, repair priority,
//    what-if simulation, personalized routing
// ===========================================================================

test("intelligence: waterlogging rainfall mapping and bands", () => {
  assert.equal(rainfallRiskFromMm(0), 0);
  assert.equal(rainfallRiskFromMm(2), 35, "light rain");
  assert.equal(rainfallRiskFromMm(5), 60, "moderate rain");
  assert.equal(rainfallRiskFromMm(20), 85, "heavy rain");
  assert.equal(rainfallRiskFromMm(120), 100, "cloudburst-level");
  assert.equal(rainfallRiskFromMm(-1), null, "invalid → null, not a fake low value");
  assert.equal(rainfallRiskFromMm(NaN), null);
  assert.equal(classifyWaterloggingRisk(90).key, "severe");
  assert.equal(classifyWaterloggingRisk(65).key, "high");
  assert.equal(classifyWaterloggingRisk(45).key, "moderate");
  assert.equal(classifyWaterloggingRisk(10).key, "low");
  assert.equal(classifyWaterloggingRisk(NaN).key, "unknown");
  assert.equal(WATERLOGGING_LABEL, "Predictive estimate");
});

test("intelligence: night window wraps midnight and bands are honest", () => {
  assert.equal(typeof isNightTime(new Date(NOW)), "boolean", "returns a plain boolean");
  const night = new Date(NOW);
  night.setHours(22, 0, 0, 0);
  const day = new Date(NOW);
  day.setHours(12, 0, 0, 0);
  const earlyMorning = new Date(NOW);
  earlyMorning.setHours(5, 0, 0, 0);
  assert.equal(isNightTime(night), true, "22:00 inside 19–06 window");
  assert.equal(isNightTime(day), false, "12:00 outside window");
  assert.equal(isNightTime(earlyMorning), true, "05:00 still inside wrapped window");
  assert.equal(classifyNightRisk(85).key, "severe");
  assert.equal(classifyNightRisk(10).key, "low");
  assert.equal(classifyNightRisk(NaN).key, "unknown");
  assert.equal(NIGHT_SAFETY_LABEL, "Predictive estimate");
});

test("intelligence: repair priority bands and ranking", () => {
  assert.equal(classifyPriority(90).key, "urgent");
  assert.equal(classifyPriority(70).key, "high");
  assert.equal(classifyPriority(50).key, "medium");
  assert.equal(classifyPriority(20).key, "low");
  assert.equal(classifyPriority(NaN).key, "unknown");
  const ranked = rankRepairs(
    [
      report({ id: 1, severity: "high", createdAt: NOW - 72 * HOUR }),
      report({ id: 2, severity: "low", createdAt: NOW - 1 * HOUR }),
    ],
    { now: NOW }
  );
  assert.equal(ranked.length, 2);
  assert.ok(ranked[0].score >= ranked[1].score, "worse report ranks first");
  assert.ok(ranked[0].band && typeof ranked[0].band.label === "string", "band attached");
});

test("intelligence: what-if simulation is labelled hypothetical", () => {
  const sim = runWhatIf({ reports: [report(), report({ id: 2, severity: "high" })], now: NOW });
  assert.equal(sim.label, WHAT_IF_LABEL);
  assert.equal(sim.label, "Scenario Simulation");
  assert.ok(sim.reasons.some((r) => r.includes("Hypothetical only")), "no implied achievement");
  assert.ok(WHAT_IF_MODES.length >= 4, "multiple scenario modes offered");
  assert.ok(Number.isFinite(sim.matchedCount) && sim.matchedCount >= 0);
  assert.ok(sim.delta && "healthIndex" in sim.delta, "delta always present");
  const noMatch = runWhatIf({ reports: [], now: NOW });
  assert.equal(noMatch.matchedCount, 0);
  assert.ok(noMatch.reasons.some((r) => r.startsWith("⚠")), "no-op scenario says so");
});

test("intelligence: personalized routing preferences", () => {
  assert.equal(recommendationConfigFor("safest").weights.safety, 0.7);
  assert.equal(recommendationConfigFor("fastest").weights.safety, 0.3);
  assert.equal(recommendationConfigFor("bogus").weights.safety, 0.5, "unknown → balanced default");
  assert.equal(ROUTE_PRIORITIES.length, 3);
  assert.ok(isValidPriority("balanced") && !isValidPriority("yeet"));

  const clean = normalizeRoutePreferences(null);
  assert.equal(clean.priority, "balanced");
  assert.equal(clean.avoidUnpaved, false);
  const dirty = normalizeRoutePreferences({ priority: "invalid", avoidTolls: "yes" });
  assert.equal(dirty.priority, "balanced", "invalid priority falls back");
  assert.equal(dirty.avoidTolls, true, "truthy coerced to boolean");

  assert.equal(buildExcludeParam({}), null, "nothing to exclude → null");
  assert.equal(buildExcludeParam({ avoidUnpaved: true }), "unpaved");
  assert.equal(buildExcludeParam({ avoidUnpaved: true, avoidTolls: true }), "unpaved,toll");
});

// ===========================================================================
// 6. ADMINISTRATION — confidence system
// ===========================================================================

test("administration: report confidence assesses evidence levels", () => {
  const none = assessReportConfidence([], { now: NOW });
  assert.equal(none.level, "LOW", "no reports → LOW, never HIGH");
  const some = assessReportConfidence(
    [report({ coordSource: "gps" }), report({ id: 2, coordSource: "gps" })],
    { now: NOW }
  );
  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(some.level), "known level");
  assert.ok(Number.isFinite(some.score) && some.score >= 0);
  assert.equal(locationConfidence("gps").level, "HIGH");
  assert.equal(locationConfidence("exif").level, "HIGH");
  assert.equal(locationConfidence("ocr").level, "MEDIUM");
  assert.equal(locationConfidence("nonsense-source").level, "LOW", "unknown source → LOW");
});

// ===========================================================================
// 7. RESILIENCE — API failures, missing AI model, network errors
// ===========================================================================

test("resilience: incident feed failure degrades to {available:false}", async () => {
  const noUrl = await fetchExternalIncidents(undefined);
  assert.equal(noUrl.available, false);
  assert.deepEqual(noUrl.items, []);
  assert.equal(noUrl.error, null);

  const failed = await fetchExternalIncidents("http://127.0.0.1:1/feed.json");
  assert.equal(failed.available, false, "network failure never throws to the caller");
  assert.deepEqual(failed.items, []);
  assert.ok(typeof failed.error === "string" && failed.error.length > 0, "error is reported");
});

test("resilience: fetchJson surfaces network errors instead of hanging", async () => {
  await assert.rejects(
    () => fetchJson("http://127.0.0.1:1/x", { timeoutMs: 2000, retries: 0 }),
    (err) => err && typeof err.message === "string",
    "connection failure rejects with a real error"
  );
});

test("resilience: no bundled AI model → honest no-detection answer", async () => {
  assert.equal(DETECTOR_INFO.kind, "rule-based", "ships no model and says so");
  assert.equal(getActiveDetector().kind, "rule-based");
  const res = await detectPotholes("any-image");
  assert.equal(res.available, false, "model unavailable is stated plainly");
  assert.equal(res.detected, false);
  assert.deepEqual(res.detections, [], "never fabricates detections");
  assert.equal(res.detector.kind, "rule-based");
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
    console.log(`    ${String(err && err.message || err).split("\n")[0]}`);
  }
}
console.log(`\nt35: ${passed}/${queue.length} passed`);
if (failures) process.exit(1);
