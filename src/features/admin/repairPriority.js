/**
 * Repair priority engine.
 *
 * Ranks the ACTIVE hazard reports by how urgently they deserve repair,
 * using only evidence the app actually stores:
 *   - severity (high/critical hurt more)
 *   - hazard type criticality (a road closure is not a cosmetic issue)
 *   - age (older unresolved hazards have waited longer)
 *   - confirmation status (admin-verified beats an unreviewed report)
 *   - recurrence (other active reports clustered at the same spot)
 *
 * This is a descriptive ranking of reported hazards — NOT an official
 * work order, NOT a budget or resource plan, and NOT a prediction of
 * accidents. The result carries PRIORITY_LABEL ("Report-based priority")
 * wherever it is displayed. Fixed/rejected/hidden reports are excluded;
 * missing inputs fall back to lower weights instead of guessed values.
 */
import { distMeters, isValidCoord } from "../routing/geo";
import { hazardTypeMeta } from "../safety/hazardTypes";
import { normalizeStatus, isActiveStatus } from "./hazardLifecycle";

/** Display label that must accompany every priority number in the UI. */
export const PRIORITY_LABEL = "Report-based priority";

/** Relative weight of each factor (all factors are usually available). */
export const PRIORITY_WEIGHTS = {
  severity: 0.35,
  type: 0.20,
  age: 0.15,
  confirmation: 0.15,
  recurrence: 0.15,
};

/** Score contribution of each severity level (0..100). */
export const PRIORITY_SEVERITY_SCORE = { critical: 100, high: 80, moderate: 50, low: 25 };

/**
 * Score contribution of each hazard type (0..100) — how much a repair of
 * this type matters for road safety. Documentation-order types map first
 * through hazardTypeMeta for canonical keys.
 */
export const PRIORITY_TYPE_SCORE = {
  "road-closure": 95,
  "signal-problem": 90,
  "fallen-tree": 85,
  "broken-road": 80,
  waterlogging: 75,
  "damaged-divider": 70,
  "poor-visibility": 65,
  construction: 60,
  "road-debris": 60,
  pothole: 55,
  other: 40,
};

/** Score contribution of each lifecycle status (0..100). */
export const PRIORITY_STATUS_SCORE = {
  verified: 100, // admin confirmed — definitely real
  "repair-requested": 85, // queued for repair but not done
  "under-review": 70, // being reviewed
  reported: 50, // fresh, unreviewed
};

/** Days for the age factor to reach its maximum (saturating). */
export const PRIORITY_AGE_SATURATION_DAYS = 14;

/** Recurrence window: other active reports within this range count. */
export const PRIORITY_RECURRENCE_METERS = 150;

/** Priority bands (higher score = more urgent). */
export const PRIORITY_BANDS = [
  { key: "urgent", label: "Urgent", min: 80, color: "#ef4444" },
  { key: "high", label: "High", min: 60, color: "#f97316" },
  { key: "medium", label: "Medium", min: 40, color: "#eab308" },
  { key: "low", label: "Low", min: 0, color: "#22c55e" },
];

const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/** Classify a 0..100 priority score into a labeled band. */
export function classifyPriority(score) {
  if (!Number.isFinite(score)) {
    return { key: "unknown", label: "Unknown", min: 0, color: "#9ca3af" };
  }
  const v = clamp(score);
  return PRIORITY_BANDS.find((b) => v >= b.min) || PRIORITY_BANDS[PRIORITY_BANDS.length - 1];
}

/** 0..100 age score: longer-waiting hazards rank higher (saturating). */
export function ageScore(report, now = Date.now()) {
  const created = Number(report?.captureAt || report?.createdAt);
  if (!Number.isFinite(created) || created <= 0) return 0; // unknown age → no boost
  const days = Math.max(0, (now - created) / (24 * 3600 * 1000));
  return Math.round(clamp((days / PRIORITY_AGE_SATURATION_DAYS) * 100));
}

/** 0..100 severity score. */
export function severityScore(severity) {
  const key = String(severity || "moderate").toLowerCase();
  return PRIORITY_SEVERITY_SCORE[key] ?? PRIORITY_SEVERITY_SCORE.moderate;
}

/** 0..100 type-criticality score (canonical key via hazardTypeMeta). */
export function typeScore(type) {
  const canonical = String(hazardTypeMeta(type)?.key || type || "other").toLowerCase();
  return PRIORITY_TYPE_SCORE[canonical] ?? PRIORITY_TYPE_SCORE.other;
}

/** 0..100 confirmation score from the lifecycle status. */
export function confirmationScore(status) {
  const key = normalizeStatus(status);
  return PRIORITY_STATUS_SCORE[key] ?? PRIORITY_STATUS_SCORE.reported;
}

/**
 * Count OTHER active reports clustered around one report (recurrence —
 * the same spot reported again and again means a real, persistent hazard).
 *
 * @param {Object} report index report
 * @param {Array} reports all reports
 * @param {number} [thresholdMeters]
 * @returns {number}
 */
export function recurrenceCount(report, reports = [], thresholdMeters = PRIORITY_RECURRENCE_METERS) {
  if (!report || !isValidCoord(report.coord) || !Array.isArray(reports)) return 0;
  let n = 0;
  for (const other of reports) {
    if (!other || other === report) continue;
    if (other.id != null && report.id != null && other.id === report.id) continue;
    if (!isValidCoord(other.coord)) continue;
    if (!isActiveStatus(other.status)) continue;
    if (other.hiddenGlobally || other.hiddenForUser) continue;
    const d = distMeters(other.coord, report.coord);
    if (isFinite(d) && d <= thresholdMeters) n += 1;
  }
  return n;
}

/** 0..100 recurrence score (each additional nearby hazard adds evidence). */
export function recurrenceScore(others) {
  const n = Math.max(0, Number(others) || 0);
  return Math.round(clamp(n * 33));
}

/**
 * Score one report for repair priority.
 *
 * @param {Object} report the report to score
 * @param {Object} [ctx]
 * @param {Array} [ctx.reports] all reports (for recurrence)
 * @param {number|Date} [ctx.now] injectable clock
 * @param {number} [ctx.thresholdMeters] recurrence window
 * @returns {{score:number, band:Object, factors:Object, reasons:string[]}|null}
 *   null when the report is not eligible (fixed/rejected/hidden)
 */
export function repairPriority(report, ctx = {}) {
  const { reports = [], now = Date.now(), thresholdMeters = PRIORITY_RECURRENCE_METERS } = ctx;
  if (!report || typeof report !== "object") return null;
  if (report.hiddenGlobally || report.hiddenForUser) return null;
  const status = normalizeStatus(report.status);
  if (!isActiveStatus(status)) return null; // fixed / rejected are not repair candidates

  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const factors = {
    severity: { key: "severity", label: "Severity", score: severityScore(report.severity), available: true },
    type: { key: "type", label: "Hazard type", score: typeScore(report.type), available: true },
    age: { key: "age", label: "Age", score: ageScore(report, nowMs), available: Number.isFinite(Number(report.captureAt || report.createdAt)) },
    confirmation: { key: "confirmation", label: "Confirmation", score: confirmationScore(status), available: true },
  };
  const others = recurrenceCount(report, reports, thresholdMeters);
  factors.recurrence = { key: "recurrence", label: "Recurring reports", score: recurrenceScore(others), available: true, others };

  // Weighted sum with renormalization when a factor is unavailable
  let weighted = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(PRIORITY_WEIGHTS)) {
    const f = factors[key];
    if (!f || !f.available) continue;
    weighted += weight * f.score;
    weightTotal += weight;
  }
  const rounded = Math.round(clamp(weighted / (weightTotal || 1)));

  const band = classifyPriority(rounded);

  const reasons = [];
  const meta = hazardTypeMeta(report.type);
  reasons.push(`Severity ${report.severity || "moderate"} contributes ${factors.severity.score}`);
  reasons.push(`${meta?.label || report.type || "Hazard"} criticality ${factors.type.score}`);
  reasons.push(
    factors.age.available
        ? `Waiting ${Math.max(0, Math.round((nowMs - Number(report.captureAt || report.createdAt)) / (24 * 3600 * 1000)))} day(s) → age score ${factors.age.score}`
        : "Age unknown — no boost applied"
  );
  reasons.push(`Status "${status}" → confirmation ${factors.confirmation.score}`);
  reasons.push(
    others > 0
      ? `${others} other active report${others === 1 ? "" : "s"} within ${thresholdMeters} m → recurrence ${factors.recurrence.score}`
      : "No other active reports at this spot"
  );

  return { score: rounded, band, factors, reasons, status };
}

/**
 * Rank all eligible (active) reports by repair priority.
 *
 * @param {Array} reports all user reports
 * @param {Object} [ctx] same as repairPriority
 * @returns {{rank:number, report:Object, score:number, band:Object,
 *   factors:Object, reasons:string[], status:string}[]} sorted, most
 *   urgent first; ties broken by age then id for determinism
 */
export function rankRepairs(reports = [], ctx = {}) {
  if (!Array.isArray(reports)) return [];
  const nowMs = ctx.now instanceof Date ? ctx.now.getTime() : Number(ctx.now) || ctx.now || Date.now();
  const scored = [];
  for (const r of reports) {
    const p = repairPriority(r, { ...ctx, now: nowMs });
    if (p) scored.push({ report: r, ...p });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const at = Number(a.report.captureAt || a.report.createdAt || 0);
    const bt = Number(b.report.captureAt || b.report.createdAt || 0);
    if (at !== bt) return at - bt; // older first
    const ai = a.report.id != null ? String(a.report.id) : "";
    const bi = b.report.id != null ? String(b.report.id) : "";
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
  return scored.map((entry, i) => ({ rank: i + 1, ...entry }));
}
