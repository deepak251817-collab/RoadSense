/**
 * Road health index.
 *
 * A descriptive, report-based index (0..100, higher = healthier) derived
 * ONLY from the crowd reports the app actually stores. It is a
 * measurement of what has been reported — not an inspection of the road
 * network and not a prediction. With no reports at all the index is
 * "Insufficient Data": an empty database is missing evidence, not proof
 * of perfect roads.
 *
 * Inputs:
 *   - active (unresolved) hazard reports, severity-weighted — pressure
 *   - the high-severity share of those active reports — severity mix
 *   - fixed reports vs total — repair progress
 *
 * Rejected reports are excluded entirely (they were judged not to be
 * road hazards); hidden reports are excluded from the public view.
 */
import { CONFIDENCE_BANDS } from "../safety/safetyScore";

/** Display label that must accompany the index in the UI. */
export const ROAD_HEALTH_LABEL = "Report-based index";

/** Severity weights used for active-report pressure. */
const ROAD_HEALTH_SEVERITY_WEIGHTS = { high: 3, moderate: 2, low: 1, critical: 4 };

/**
 * Half-saturation constant: this many severity-weighted active reports
 * produce half of the maximum pressure penalty. Keeps the index
 * meaningful for both a handful of reports and a large database.
 */
const ROAD_HEALTH_SATURATION = 12;

/** Index bands (higher = healthier). */
const ROAD_HEALTH_BANDS = [
  { key: "good", label: "Good", min: 80, color: "#22c55e" },
  { key: "fair", label: "Fair", min: 60, color: "#eab308" },
  { key: "poor", label: "Poor", min: 40, color: "#f97316" },
  { key: "critical", label: "Critical", min: 0, color: "#ef4444" },
];

/** Classify a 0..100 health index into a labeled band. */
export function classifyRoadHealth(index) {
  if (!Number.isFinite(index)) {
    return { key: "insufficient", label: "Insufficient Data", min: 0, color: "#9ca3af" };
  }
  const v = Math.max(0, Math.min(100, index));
  return ROAD_HEALTH_BANDS.find((b) => v >= b.min) || ROAD_HEALTH_BANDS[ROAD_HEALTH_BANDS.length - 1];
}

/** Severity weight for a report (unknown severity counts as moderate). */
export function severityWeight(severity) {
  const key = String(severity || "moderate").toLowerCase();
  return ROAD_HEALTH_SEVERITY_WEIGHTS[key] ?? ROAD_HEALTH_SEVERITY_WEIGHTS.moderate;
}

/**
 * Tally the report database into the raw counts the index needs.
 *
 * @param {Array} reports all user reports
 * @returns {{total:number, active:number, fixed:number, rejected:number,
 *   hidden:number, activeHigh:number, activeCritical:number,
 *   weightedActive:number, severityMix:{low:number, moderate:number, high:number, critical:number}}}
 */
export function tallyReports(reports = []) {
  const t = {
    total: 0,
    active: 0,
    fixed: 0,
    rejected: 0,
    hidden: 0,
    activeHigh: 0,
    activeCritical: 0,
    weightedActive: 0,
    severityMix: { low: 0, moderate: 0, high: 0, critical: 0 },
  };
  if (!Array.isArray(reports)) return t;
  for (const r of reports) {
    if (!r || typeof r !== "object") continue;
    t.total += 1;
    if (r.hiddenGlobally) {
      t.hidden += 1;
      continue;
    }
    if (r.status === "rejected") {
      t.rejected += 1;
      continue;
    }
    if (r.status === "fixed") {
      t.fixed += 1;
      continue;
    }
    // Active hazard (reported / under-review / verified / repair-requested …)
    t.active += 1;
    const sev = String(r.severity || "moderate").toLowerCase();
    if (sev === "high") t.activeHigh += 1;
    if (sev === "critical") t.activeCritical += 1;
    if (t.severityMix[sev] != null) t.severityMix[sev] += 1;
    else t.severityMix.moderate += 1;
    t.weightedActive += severityWeight(sev);
  }
  return t;
}

/**
 * Compute the road health index.
 *
 * @param {Object} input
 * @param {Array} [input.reports] all user reports
 * @param {number} [input.population] optional report-count normalization
 *   (reserved; currently the saturation constant handles scale)
 * @returns {{index:number|null, grade:Object, label:string, factors:Object,
 *   confidence:Object, counts:Object, reasons:string[]}}
 */
export function roadHealthIndex({ reports = [] } = {}) {
  const counts = tallyReports(reports);

  // No usable evidence at all → insufficient data (never "perfect roads").
  const usable = counts.active + counts.fixed;
  if (usable === 0) {
    const band = CONFIDENCE_BANDS[3];
    return {
      index: null,
      grade: classifyRoadHealth(NaN),
      label: ROAD_HEALTH_LABEL,
      factors: {},
      confidence: {
        level: band.key,
        label: band.label,
        color: band.color,
        score: 0,
        reportCount: counts.total,
        reasons: [
          counts.total > 0
            ? "⚠ All reports are rejected or hidden — no usable road evidence"
            : "⚠ No reports yet — an empty database is missing evidence, not proof of healthy roads",
        ],
      },
      counts,
      reasons: [
        counts.total > 0
          ? "⚠ All reports are rejected or hidden — no usable road evidence"
          : "⚠ No reports yet — an empty database is missing evidence, not proof of healthy roads",
      ],
    };
  }

  // --- Factor 1: active hazard pressure (saturating) ----------------------
  // weightedActive / (weightedActive + SATURATION) → 0..1
  const pressure =
    counts.weightedActive + ROAD_HEALTH_SATURATION > 0
      ? counts.weightedActive / (counts.weightedActive + ROAD_HEALTH_SATURATION)
      : 0;

  // --- Factor 2: high-severity share of active reports --------------------
  const severityShare = counts.active > 0 ? (counts.activeHigh + counts.activeCritical) / counts.active : 0;

  // --- Factor 3: repair progress (fixed share of resolvable reports) ------
  const repairRate = usable > 0 ? counts.fixed / usable : 0;

  // --- Combine: 100 − pressure penalty − severity penalty + repair credit --
  const pressurePenalty = 55 * pressure;
  const severityPenalty = 25 * severityShare;
  const repairCredit = 20 * repairRate;
  const index = Math.max(0, Math.min(100, Math.round(100 - pressurePenalty - severityPenalty + repairCredit)));

  const factors = {
    pressure: {
      key: "pressure",
      label: "Active hazard pressure",
      value: Math.round(pressure * 100),
      penalty: Math.round(pressurePenalty),
      available: true,
      weightedActive: counts.weightedActive,
    },
    severity: {
      key: "severity",
      label: "High-severity share",
      value: Math.round(severityShare * 100),
      penalty: Math.round(severityPenalty),
      available: true,
      activeHigh: counts.activeHigh + counts.activeCritical,
      active: counts.active,
    },
    repairs: {
      key: "repairs",
      label: "Repair progress",
      value: Math.round(repairRate * 100),
      credit: Math.round(repairCredit),
      available: true,
      fixed: counts.fixed,
      usable,
    },
  };

  // Confidence from how much usable evidence exists.
  let band = CONFIDENCE_BANDS[2]; // low
  if (usable >= 20) band = CONFIDENCE_BANDS[0]; // high
  else if (usable >= 5) band = CONFIDENCE_BANDS[1]; // medium

  const reasons = [
    `✓ ${usable} usable report${usable === 1 ? "" : "s"} (${counts.active} active, ${counts.fixed} fixed)`,
    counts.rejected > 0 ? `✓ ${counts.rejected} rejected report${counts.rejected === 1 ? "" : "s"} excluded from the index` : "✓ No rejected reports to exclude",
    counts.active > 0
      ? `✓ ${counts.activeHigh + counts.activeCritical} of ${counts.active} active reports are high/critical severity`
      : "✓ No active hazards currently reported",
    counts.fixed > 0 ? `✓ ${counts.fixed} hazard${counts.fixed === 1 ? "" : "s"} marked fixed (repair progress credited)` : "⚠ No fixed reports yet — no repair progress to credit",
    band.key === "high" ? "✓ Report volume sufficient for a stable index" : "⚠ Small report volume — index may swing with a few reports",
  ];

  return {
    index,
    grade: classifyRoadHealth(index),
    label: ROAD_HEALTH_LABEL,
    factors,
    confidence: {
      level: band.key,
      label: band.label,
      color: band.color,
      score: Math.min(100, Math.round((usable / 20) * 100)),
      reportCount: usable,
      reasons,
    },
    counts,
    reasons,
  };
}
