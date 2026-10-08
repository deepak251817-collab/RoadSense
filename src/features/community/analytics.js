/**
 * Safety analytics.
 *
 * Aggregates hazard reports and trip history into display-ready metrics:
 * lifecycle breakdown, severity mix, fix rate, a weekly report trend, and
 * trip stats. Everything is derived from real stored data — no forecasts,
 * no invented numbers. Deterministic for a given `now`.
 */
import { tripSummary } from "./tripHistory";
import { normalizeStatus, HAZARD_STATUSES, STATUS_LABELS } from "../admin/hazardLifecycle";

export const ANALYTICS_CONFIG = {
  /** Window for "recent" hazard counts. */
  recentDays: 30,
  /** Number of weekly buckets in the trend (oldest → newest). */
  trendWeeks: 8,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Severity counts, only over well-formed reports. */
function severityMix(reports) {
  const mix = { high: 0, moderate: 0, low: 0, other: 0 };
  for (const r of reports) {
    const key = String(r?.severity || "").toLowerCase();
    if (key in mix) mix[key] += 1;
    else mix.other += 1;
  }
  return mix;
}

/**
 * Weekly report counts for the last `trendWeeks` weeks (oldest first).
 * A report belongs to the week of its capture/creation time; reports
 * without a usable timestamp are ignored here but still counted in totals.
 *
 * @returns {Array<{label:string, weekStart:number, count:number}>}
 */
function weeklyTrend(reports, now, trendWeeks) {
  const weekMs = 7 * DAY_MS;
  const end = now;
  const start = end - trendWeeks * weekMs;
  const buckets = [];
  for (let i = 0; i < trendWeeks; i++) {
    const weekStart = start + i * weekMs;
    buckets.push({
      label: new Date(weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weekStart,
      count: 0,
    });
  }
  for (const r of reports) {
    const ts = Number(r?.captureAt || r?.createdAt);
    if (!Number.isFinite(ts)) continue;
    if (ts < start || ts >= end) continue;
    const idx = Math.min(trendWeeks - 1, Math.floor((ts - start) / weekMs));
    buckets[idx].count += 1;
  }
  return buckets;
}

/**
 * Compute the full analytics snapshot.
 *
 * @param {Object} [opts]
 * @param {Array} [opts.reports] user pothole reports
 * @param {Array} [opts.trips] persisted trip history
 * @param {number} [opts.now] fixed timestamp for determinism
 * @returns {{hazards:Object, lifecycle:Array, trend:Array, trips:Object}}
 */
export function computeSafetyAnalytics({ reports = [], trips = [], now = Date.now() } = {}) {
  const list = (Array.isArray(reports) ? reports : []).filter((r) => r && typeof r === "object");
  const recentCutoff = now - ANALYTICS_CONFIG.recentDays * DAY_MS;

  const lifecycleCounts = {};
  for (const status of Object.values(HAZARD_STATUSES)) lifecycleCounts[status] = 0;
  let recentCount = 0;
  let withPhoto = 0;
  for (const r of list) {
    const status = normalizeStatus(r.status);
    lifecycleCounts[status] = (lifecycleCounts[status] || 0) + 1;
    const ts = Number(r.captureAt || r.createdAt);
    if (Number.isFinite(ts) && ts >= recentCutoff) recentCount += 1;
    if (r.photoDataUrl) withPhoto += 1;
  }

  const fixed = lifecycleCounts[HAZARD_STATUSES.FIXED];
  const rejected = lifecycleCounts[HAZARD_STATUSES.REJECTED];
  const resolved = fixed + rejected;
  const active =
    lifecycleCounts[HAZARD_STATUSES.REPORTED] +
    lifecycleCounts[HAZARD_STATUSES.UNDER_REVIEW] +
    lifecycleCounts[HAZARD_STATUSES.VERIFIED] +
    lifecycleCounts[HAZARD_STATUSES.REPAIR_REQUESTED];

  const hazards = {
    total: list.length,
    active,
    fixed,
    rejected,
    resolved,
    /** Share of resolved hazards that ended fixed (null when nothing resolved). */
    fixRate: resolved > 0 ? Math.round((fixed / resolved) * 100) : null,
    recentCount,
    photoCount: withPhoto,
    severity: severityMix(list),
  };

  const lifecycle = Object.values(HAZARD_STATUSES).map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: lifecycleCounts[status] || 0,
  }));

  return {
    hazards,
    lifecycle,
    trend: weeklyTrend(list, now, ANALYTICS_CONFIG.trendWeeks),
    trips: tripSummary(trips),
  };
}
