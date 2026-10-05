/**
 * Municipal dashboard summary.
 *
 * Aggregates the engines already in the app (report tally, road health,
 * repair priority, change detection, hazard-type mix) into one
 * admin-facing overview for the local moderation dashboard.
 *
 * Every number is derived from the reports stored in THIS browser — it
 * is a "Report-based summary", not a connection to any municipal system,
 * not an official statistic, and not a prediction. Callers must display
 * MUNICIPAL_LABEL wherever these numbers appear.
 */
import { HAZARD_TYPES, hazardTypeMeta } from "./hazardTypes";
import { normalizeStatus, isActiveStatus, STATUS_LABELS, STATUS_ORDER } from "./hazardLifecycle";
import { tallyReports, roadHealthIndex } from "./roadHealth";
import { rankRepairs, PRIORITY_LABEL } from "./repairPriority";
import { detectChanges, CHANGE_LABEL } from "./changeDetection";

/** Display label that must accompany the dashboard numbers in the UI. */
export const MUNICIPAL_LABEL = "Report-based summary";

/** How many top repair priorities the dashboard surfaces. */
export const MUNICIPAL_TOP_PRIORITIES = 5;

/**
 * Build the municipal dashboard summary.
 *
 * @param {Object} input
 * @param {Array}  [input.reports] all user reports
 * @param {Array}  [input.snapshots] change-detection baselines
 * @param {number|Date} [input.now] injectable clock
 * @returns {{label:string, kpi:Object, byType:Array, lifecycle:Array,
 *   topPriorities:Array, health:Object, trend:Object, reasons:string[]}}
 */
export function summarizeMunicipal({ reports = [], snapshots = [], now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const list = Array.isArray(reports) ? reports : [];

  // --- Core tally + health (shared with the Road Health panel) ------------
  const counts = tallyReports(list);
  const health = roadHealthIndex({ reports: list });

  // --- Repair rate: fixed share of all resolvable reports ------------------
  const resolvable = counts.active + counts.fixed;
  const repairRate = resolvable > 0 ? Math.round((counts.fixed / resolvable) * 100) : null;

  // --- Active hazard mix by canonical type (documented order) -------------
  const activeByType = new Map();
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    if (r.hiddenGlobally || r.hiddenForUser) continue;
    if (!isActiveStatus(normalizeStatus(r.status))) continue;
    const key = String(hazardTypeMeta(r.type)?.value || r.type || "other");
    const bucket = activeByType.get(key) || { key, count: 0, high: 0 };
    bucket.count += 1;
    const sev = String(r.severity || "").toLowerCase();
    if (sev === "high" || sev === "critical") bucket.high += 1;
    activeByType.set(key, bucket);
  }
  const order = HAZARD_TYPES.map((t) => t.value);
  const byType = Array.from(activeByType.values()).sort(
    (a, b) => (order.indexOf(a.key) - order.indexOf(b.key)) || b.count - a.count
  );

  // --- Lifecycle queue (action-first order from hazardLifecycle) ----------
  const statusCounts = new Map();
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    if (r.hiddenGlobally) continue;
    const st = normalizeStatus(r.status);
    statusCounts.set(st, (statusCounts.get(st) || 0) + 1);
  }
  const lifecycle = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, label: STATUS_LABELS[status] || status, count, order: STATUS_ORDER[status] ?? 99 }))
    .sort((a, b) => a.order - b.order || b.count - a.count);

  // --- Top repair priorities (same engine as the Priority panel) ----------
  const topPriorities = rankRepairs(list, { now: nowMs }).slice(0, MUNICIPAL_TOP_PRIORITIES);

  // --- Trend vs stored baseline (same guard as the Changes panel) ---------
  const trend = detectChanges({ snapshots, reports: list, now: nowMs });

  const kpi = {
    total: counts.total,
    active: counts.active,
    fixed: counts.fixed,
    rejected: counts.rejected,
    highActive: counts.activeHigh + counts.activeCritical,
    repairRate,
    healthIndex: health.index,
    healthGrade: health.grade,
    pendingReview: statusCounts.get("reported") || 0,
    pendingFixReview: list.filter((r) => r && r.pendingFixReview).length,
  };

  const reasons = [
    `✓ ${counts.total} report${counts.total === 1 ? "" : "s"} stored locally (${counts.active} active, ${counts.fixed} fixed, ${counts.rejected} rejected)`,
    repairRate != null ? `✓ Repair rate ${repairRate}% of ${resolvable} resolvable report${resolvable === 1 ? "" : "s"}` : "⚠ No resolvable reports yet — repair rate unavailable",
    kpi.highActive > 0
      ? `⚠ ${kpi.highActive} high/critical active hazard${kpi.highActive === 1 ? " needs" : "s need"} attention`
      : "✓ No high/critical active hazards",
    `✓ Health index ${health.index ?? "—"} (${health.grade.label}) — ${PRIORITY_LABEL.toLowerCase()} engine ranks ${topPriorities.length} entr${topPriorities.length === 1 ? "y" : "ies"} for repair`,
    trend.insufficientHistory ? `⚠ Trend: ${trend.reason}` : `✓ Trend vs baseline: ${trend.directionLabel} (${CHANGE_LABEL.toLowerCase()})`,
  ];

  return {
    label: MUNICIPAL_LABEL,
    kpi,
    byType,
    lifecycle,
    topPriorities,
    health,
    trend,
    reasons,
  };
}
