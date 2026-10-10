/**
 * What-if simulation: "what if the selected hazards were repaired?"
 *
 * A deterministic SCENARIO SIMULATION over the reports the app actually
 * stores. It takes the live database, marks the selected active hazards
 * as fixed, and re-runs the same scoring engines (route safety score and
 * road health index) on the result — so the before/after numbers are
 * produced by the real engines, not by invented coefficients.
 *
 * Honesty rules:
 *   - Every output must be displayed with WHAT_IF_LABEL
 *     ("Scenario Simulation"). This is a hypothetical, not a forecast of
 *     achieved improvement, not a schedule and not a promise.
 *   - Unchanged factors (traffic, weather, incidents, time) are held
 *     exactly at their baseline values; only the repaired factors move —
 *     unless the caller requests simulated conditions (traffic increase,
 *     rain, reduced visibility), which are applied ONLY to the simulated
 *     side and explained factor-by-factor in the reasons.
 *   - With no matching hazards the simulation is a no-op and says so.
 */
import { collectRouteReports } from "./routeAnalysis";
import {
  calculatePotholeRisk,
  calculateRoadConditionRisk,
  calculateRoadSafetyScore,
} from "../safety/safetyScore";
import { roadHealthIndex } from "../road-conditions/roadHealth";
import { rainfallRiskFromMm } from "../road-conditions/waterlogging";
import { isPotholeType } from "../safety/hazardTypes";
import { isActiveStatus, normalizeStatus } from "../admin/hazardLifecycle";

/** Display label that must accompany every simulated number in the UI. */
export const WHAT_IF_LABEL = "Scenario Simulation";

/** Supported selection modes. */
export const WHAT_IF_MODES = [
  { key: "all", label: "All active hazards" },
  { key: "high", label: "High & critical only" },
  { key: "pothole", label: "Potholes only" },
  { key: "waterlogging", label: "Waterlogging only" },
  { key: "conditions", label: "Other road conditions" },
];

/** Traffic-increase options offered by the simulator (percent above baseline). */
export const WHAT_IF_TRAFFIC_STEPS = [0, 25, 50];

/** Rain options; mapped through the documented rainfall→risk table. */
export const WHAT_IF_RAIN_LEVELS = [
  { key: "none", label: "None" },
  { key: "moderate", label: "Moderate" },
  { key: "heavy", label: "Heavy" },
];

/** Visibility options; "reduced" is a documented rule-based assumption. */
export const WHAT_IF_VISIBILITY_LEVELS = [
  { key: "normal", label: "Normal" },
  { key: "reduced", label: "Reduced" },
];

/** Rule-based weather risk assumed for simulated reduced visibility. */
export const WHAT_IF_REDUCED_VISIBILITY_RISK = 70;

/**
 * Normalize simulated-condition adjustments. Unknown/missing values fall
 * back to neutral (0% / none / normal) so a stored or malformed input can
 * never produce a wild simulation.
 *
 * @param {Object} [raw] { trafficPct, rain, visibility }
 * @returns {{trafficPct:number, rain:string, visibility:string}}
 */
export function normalizeWhatIfAdjustments(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const pct = Number(src.trafficPct);
  return {
    trafficPct: WHAT_IF_TRAFFIC_STEPS.includes(pct) ? pct : 0,
    rain: WHAT_IF_RAIN_LEVELS.some((r) => r.key === src.rain) ? src.rain : "none",
    visibility: WHAT_IF_VISIBILITY_LEVELS.some((v) => v.key === src.visibility)
      ? src.visibility
      : "normal",
  };
}

/** True when at least one simulated condition differs from neutral. */
export function hasWhatIfAdjustments(adj) {
  const a = normalizeWhatIfAdjustments(adj);
  return a.trafficPct !== 0 || a.rain !== "none" || a.visibility !== "normal";
}

const MATCHERS = {
  all: () => true,
  high: (r) => {
    const sev = String(r.severity || "").toLowerCase();
    return sev === "high" || sev === "critical";
  },
  pothole: (r) => isPotholeType(r.type),
  waterlogging: (r) => r.type === "waterlogging",
  conditions: (r) => !isPotholeType(r.type) && r.type !== "waterlogging",
};

/** Is this report an active (repairable) hazard? */
function isActiveCandidate(report) {
  if (!report || typeof report !== "object") return false;
  if (report.hiddenGlobally || report.hiddenForUser) return false;
  return isActiveStatus(normalizeStatus(report.status));
}

/** Reports matched by a selection mode (active ones only). */
function matchReportsForMode(reports = [], mode = "all") {
  const matcher = MATCHERS[mode] || MATCHERS.all;
  return (Array.isArray(reports) ? reports : []).filter((r) => isActiveCandidate(r) && matcher(r));
}

/** Apply the simulation: matched active reports become "fixed". */
function applySimulation(reports = [], mode = "all") {
  const matchedIds = new Set(matchReportsForMode(reports, mode).map((r) => r.id));
  const simulated = (Array.isArray(reports) ? reports : []).map((r) =>
    r && matchedIds.has(r.id) ? { ...r, status: "fixed", simulatedFixed: true } : r
  );
  return { matchedIds, simulated };
}

/** Route-factor risks derived from reports near the route (pothole/condition). */
function routeReportRisks(route, reports) {
  const near = collectRouteReports(route, reports, { showFixed: false });
  const distanceMeters = Number(route?.distance) || null;
  return {
    pothole: calculatePotholeRisk({
      count: near.activePotholeCount,
      highSeverityCount: near.activePotholeHigh,
      distanceMeters,
    }),
    roadCondition: calculateRoadConditionRisk({
      count: near.activeConditionCount,
      highSeverityCount: near.activeConditionHigh,
      distanceMeters,
    }),
    activeNear: near.activeCount,
  };
}

/**
 * Run the what-if simulation.
 *
 * @param {Object} input
 * @param {Array}  [input.reports] live reports
 * @param {Object|null} [input.route] selected Mapbox route (enables the
 *   route-safety part of the simulation)
 * @param {Object|null} [input.baselineFactorRisks] the route analysis'
 *   current factor risks — unchanged factors are held at these values
 * @param {string} [input.mode] selection mode key (see WHAT_IF_MODES)
 * @param {number|Date} [input.now] injectable clock (health index uses it)
 * @returns {Object} {label, mode, matchedCount, matched, baseline,
 *   simulated, delta, unchanged, reasons}
 */
export function runWhatIf({
  reports = [],
  route = null,
  baselineFactorRisks = null,
  mode = "all",
  adjustments = null,
  now = Date.now(),
} = {}) {
  const list = Array.isArray(reports) ? reports : [];
  const modeMeta = WHAT_IF_MODES.find((m) => m.key === mode) || WHAT_IF_MODES[0];
  const { matchedIds, simulated } = applySimulation(list, modeMeta.key);
  const matched = list.filter((r) => r && matchedIds.has(r.id));
  // Simulated-condition adjustments (traffic %, rain, visibility) — declared
  // at function scope so the return can always report them, route or not.
  const adj = normalizeWhatIfAdjustments(adjustments);
  const adjReasons = [];

  // --- Health index before/after -----------------------------------------
  const healthBefore = roadHealthIndex({ reports: list });
  const healthAfter = roadHealthIndex({ reports: simulated });

  // --- Route safety score before/after (only factors that can change) ----
  let routeBefore = null;
  let routeAfter = null;
  if (route && route?.geometry?.coordinates) {
    const risksBefore = routeReportRisks(route, list);
    const risksAfter = routeReportRisks(route, simulated);

    // Hold every other factor exactly at its baseline value — unless a
    // simulated condition (traffic %, rain, visibility) was requested,
    // which is applied only to the AFTER side and explained in reasons.
    const base = baselineFactorRisks || {};
    let simTraffic = base.traffic ?? null;
    let simWeather = base.weather ?? null;
    if (adj.trafficPct !== 0) {
      if (Number.isFinite(base.traffic)) {
        simTraffic = Math.min(100, Math.round(base.traffic * (1 + adj.trafficPct / 100)));
        adjReasons.push(`✓ Simulated traffic +${adj.trafficPct}% (traffic factor ${base.traffic} → ${simTraffic})`);
      } else {
        adjReasons.push("⚠ Traffic increase skipped — no baseline traffic factor to scale");
      }
    }
    if (adj.rain === "moderate") {
      // Documented rainfall→risk table (waterlogging.js): 5 mm ⇒ 60.
      simWeather = rainfallRiskFromMm(5);
      adjReasons.push(`✓ Simulated moderate rain (weather factor → ${simWeather})`);
    } else if (adj.rain === "heavy") {
      // 20 mm ⇒ 85 (heavy band).
      simWeather = rainfallRiskFromMm(20);
      adjReasons.push(`✓ Simulated heavy rain (weather factor → ${simWeather})`);
    }
    if (adj.visibility === "reduced") {
      simWeather = Math.max(simWeather ?? 0, WHAT_IF_REDUCED_VISIBILITY_RISK);
      adjReasons.push(`✓ Simulated reduced visibility (weather factor → ${simWeather})`);
    }

    const buildScore = (potholeRisk, conditionRisk, trafficRisk, weatherRisk) =>
      calculateRoadSafetyScore({
        traffic: trafficRisk,
        weather: weatherRisk,
        potholes: potholeRisk,
        incidents: base.incident ?? null,
        accidents: base.accident ?? null,
        roadCondition: conditionRisk,
        timeRisk: base.time ?? null,
      });

    const scoreBefore = buildScore(
      risksBefore.pothole,
      risksBefore.roadCondition,
      base.traffic ?? null,
      base.weather ?? null
    );
    const scoreAfter = buildScore(risksAfter.pothole, risksAfter.roadCondition, simTraffic, simWeather);
    routeBefore = {
      score: scoreBefore.score,
      classification: scoreBefore.classification,
      potholeRisk: risksBefore.pothole,
      conditionRisk: risksBefore.roadCondition,
      activeNear: risksBefore.activeNear,
    };
    routeAfter = {
      score: scoreAfter.score,
      classification: scoreAfter.classification,
      potholeRisk: risksAfter.pothole,
      conditionRisk: risksAfter.roadCondition,
      activeNear: risksAfter.activeNear,
    };
  }

  const delta = {
    healthIndex:
      Number.isFinite(healthBefore.index) && Number.isFinite(healthAfter.index)
        ? healthAfter.index - healthBefore.index
        : null,
    safetyScore: routeBefore && routeAfter ? routeAfter.score - routeBefore.score : null,
  };

  const adjNow = adj; // function-scope adjustments (route block may have consumed them)
  const trafficAdjusted = adjNow.trafficPct !== 0 && Number.isFinite(baselineFactorRisks?.traffic);
  const weatherAdjusted = adjNow.rain !== "none" || adjNow.visibility !== "normal";
  const unchanged = Object.entries(baselineFactorRisks || {})
    .filter(
      ([key, v]) =>
        v != null &&
        !["pothole", "roadCondition"].includes(key) &&
        !(key === "traffic" && trafficAdjusted) &&
        !(key === "weather" && weatherAdjusted)
    )
    .map(([key]) => key);

  const remainingActive = list.filter((r) => isActiveCandidate(r) && !matchedIds.has(r.id)).length;

  const reasons = [];
  if (matched.length === 0) {
    reasons.push(`⚠ No active hazards match "${modeMeta.label}" — the simulation is a no-op`);
  } else {
    reasons.push(`✓ ${matched.length} hazard${matched.length === 1 ? "" : "s"} marked fixed in the simulation ("${modeMeta.label}")`);
    if (delta.healthIndex != null) {
      reasons.push(`✓ Road health index ${healthBefore.index ?? "—"} → ${healthAfter.index ?? "—"} (${delta.healthIndex > 0 ? "+" : ""}${delta.healthIndex})`);
    } else {
      reasons.push("⚠ Health index not comparable (insufficient data on one side)");
    }
    if (delta.safetyScore != null) {
      reasons.push(`✓ Route safety score ${routeBefore.score} → ${routeAfter.score} (${delta.safetyScore > 0 ? "+" : ""}${delta.safetyScore})`);
      reasons.push(`✓ ${routeBefore.activeNear} active report${routeBefore.activeNear === 1 ? "" : "s"} within 120 m of the route → ${routeAfter.activeNear} after simulated repairs`);
    } else {
      reasons.push("⚠ Select a route to simulate the route-safety impact");
    }
    if (unchanged.length) {
      reasons.push(`✓ Held unchanged at baseline: ${unchanged.join(", ")} (only repaired factors move)`);
    }
    reasons.push(`✓ ${remainingActive} active hazard${remainingActive === 1 ? "" : "s"} would remain after this scenario`);
  }
  reasons.push(`⚠ Hypothetical only — ${WHAT_IF_LABEL.toLowerCase()}, not an achieved or scheduled improvement`);

  return {
    label: WHAT_IF_LABEL,
    mode: modeMeta.key,
    modeLabel: modeMeta.label,
    adjustments: adj,
    adjustmentReasons: adjReasons,
    matchedCount: matched.length,
    matched,
    remainingActive,
    baseline: { health: healthBefore, route: routeBefore },
    simulated: { health: healthAfter, route: routeAfter },
    delta,
    unchanged,
    reasons,
  };
}
