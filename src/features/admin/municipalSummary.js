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
import { HAZARD_TYPES, hazardTypeMeta } from "../safety/hazardTypes";
import { normalizeStatus, isActiveStatus, STATUS_LABELS, STATUS_ORDER } from "./hazardLifecycle";
import { tallyReports, roadHealthIndex } from "../road-conditions/roadHealth";
import { rankRepairs, PRIORITY_LABEL, PRIORITY_BANDS } from "./repairPriority";
import { detectChanges, CHANGE_LABEL } from "../road-conditions/changeDetection";

/** Display label that must accompany the dashboard numbers in the UI. */
export const MUNICIPAL_LABEL = "Report-based summary";

/** How many top repair priorities the dashboard surfaces. */
export const MUNICIPAL_TOP_PRIORITIES = 5;

/** Coarse coordinate grid (~0.05°, ≈5 km) used for the dashboard location filter and area views. */
export const LOCATION_GRID_DEG = 0.05;

/**
 * Grid cell key for a coordinate. Returns null when the coordinate is
 * missing/invalid — the cell is derived purely from the stored [lng, lat],
 * never from a place name the data does not contain.
 *
 * @param {Array} [coord] [lng, lat]
 * @returns {string|null}
 */
export function gridCellKey(coord) {
  if (!Array.isArray(coord) || !Number.isFinite(Number(coord[0])) || !Number.isFinite(Number(coord[1]))) return null;
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  const latBand = Math.floor(lat / LOCATION_GRID_DEG) * LOCATION_GRID_DEG;
  const lngBand = Math.floor(lng / LOCATION_GRID_DEG) * LOCATION_GRID_DEG;
  return `${latBand.toFixed(3)}:${lngBand.toFixed(3)}`;
}

/** Human label for a grid cell — the actual coordinate window, no invented place names. */
export function gridCellLabel(key) {
  if (!key) return "Unknown area";
  const [lat, lng] = key.split(":").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Unknown area";
  return `${lat.toFixed(2)}–${(lat + LOCATION_GRID_DEG).toFixed(2)}° lat, ${lng.toFixed(2)}–${(lng + LOCATION_GRID_DEG).toFixed(2)}° lng`;
}

/**
 * Location filter options derived from the stored reports' coordinates.
 * An option only exists for a cell that actually contains reports.
 *
 * @param {Array} [reports]
 * @returns {Array<{value:string,label:string}>}
 */
export function locationOptions(reports = []) {
  const cells = new Set();
  for (const r of Array.isArray(reports) ? reports : []) {
    if (!r || typeof r !== "object" || r.hiddenGlobally) continue;
    const key = gridCellKey(r.coord);
    if (key) cells.add(key);
  }
  return [
    { value: "all", label: "Any location" },
    ...Array.from(cells)
      .sort()
      .map((key) => ({ value: key, label: gridCellLabel(key) })),
  ];
}

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

  // --- Critical roads: active high/critical hazards, worst first ----------
  // "Road" here means the grid cell the hazard sits in — reports carry no
  // street name, so none is invented.
  const critical = list
    .filter(
      (r) =>
        r &&
        typeof r === "object" &&
        !r.hiddenGlobally &&
        !r.hiddenForUser &&
        isActiveStatus(normalizeStatus(r.status)) &&
        ["high", "critical"].includes(String(r.severity || "").toLowerCase())
    )
    .map((r) => ({
      report: r,
      cell: gridCellKey(r.coord),
      area: gridCellLabel(gridCellKey(r.coord)),
      sev: String(r.severity || "").toLowerCase(),
    }))
    .sort((a, b) => (a.sev === b.sev ? Number(b.report.createdAt || 0) - Number(a.report.createdAt || 0) : a.sev === "critical" ? -1 : 1));

  // --- Trend vs stored baseline (same guard as the Changes panel) ---------
  const trend = detectChanges({ snapshots, reports: list, now: nowMs });

  // --- Deteriorating areas vs baseline (report-based comparison) ----------
  let areas;
  if (trend.insufficientHistory) {
    areas = { insufficientHistory: true, label: CHANGE_LABEL, reason: trend.reason, items: [] };
  } else {
    const baselineActive = new Set((trend.baseline?.activeIds || []).map(String));
    const buckets = new Map();
    const bucketFor = (r) => {
      const cell = gridCellKey(r.coord);
      if (!cell) return null;
      let b = buckets.get(cell);
      if (!b) {
        b = { cell, area: gridCellLabel(cell), newHazards: 0, resolvedHazards: 0 };
        buckets.set(cell, b);
      }
      return b;
    };
    // New hazards: active now but not active at baseline.
    for (const r of list) {
      if (!r || typeof r !== "object" || r.hiddenGlobally || r.hiddenForUser) continue;
      if (!isActiveStatus(normalizeStatus(r.status))) continue;
      if (r.id != null && baselineActive.has(String(r.id))) continue;
      const b = bucketFor(r);
      if (b) b.newHazards += 1;
    }
    // Resolved hazards: active at baseline, no longer active, report still stored (cell known).
    const byId = new Map();
    for (const r of list) if (r && r.id != null) byId.set(String(r.id), r);
    for (const id of baselineActive) {
      const r = byId.get(id);
      if (!r || isActiveStatus(normalizeStatus(r.status))) continue;
      const b = bucketFor(r);
      if (b) b.resolvedHazards += 1;
    }
    const items = Array.from(buckets.values())
      .map((b) => ({
        ...b,
        direction: b.newHazards > b.resolvedHazards ? "deteriorating" : b.newHazards < b.resolvedHazards ? "improving" : "stable",
      }))
      .filter((b) => b.newHazards || b.resolvedHazards)
      .sort((a, b) => {
        const rank = (x) => (x.direction === "deteriorating" ? 0 : x.direction === "stable" ? 1 : 2);
        return rank(a) - rank(b) || b.newHazards - a.newHazards || a.area.localeCompare(b.area);
      });
    areas = { insufficientHistory: false, label: CHANGE_LABEL, baselineAt: trend.baseline?.at ?? null, items };
  }

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
    critical,
    areas,
    health,
    trend,
    reasons,
  };
}

/** Filter choices offered by the dashboard filter bar (date, severity, type, status, priority). */
export const MUNICIPAL_FILTERS = {
  date: [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
  ],
  severity: [
    { value: "all", label: "Any severity" },
    { value: "low", label: "Low" },
    { value: "moderate", label: "Moderate" },
    { value: "high", label: "High / Critical" },
  ],
  type: [
    { value: "all", label: "Any type" },
    ...HAZARD_TYPES.map((t) => ({ value: t.value, label: hazardTypeMeta(t.value).label })),
  ],
  status: [
    { value: "all", label: "Any status" },
    ...Object.keys(STATUS_ORDER).map((s) => ({ value: s, label: STATUS_LABELS[s] || s })),
  ],
  priority: [
    { value: "all", label: "Any priority" },
    ...PRIORITY_BANDS.filter((b) => b.key !== "unknown").map((b) => ({ value: b.key, label: b.label })),
  ],
};

/**
 * Apply the dashboard filters (date, severity, type, status, priority,
 * location) to a report list. Pure and conservative: `all`/unknown values
 * pass everything through, and the result feeds summarizeMunicipal() so
 * every KPI, section and priority entry reflects the same filtered set.
 *
 * @param {Array} reports
 * @param {Object} [filters] { date, severity, type, status, priority, location }
 * @param {number|Date} [now] injectable clock
 * @returns {Array} filtered reports
 */
export function applyReportFilters(reports = [], filters = {}, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const f = filters || {};
  let out = (Array.isArray(reports) ? reports : []).filter(
    (r) => r && typeof r === "object" && !r.hiddenGlobally
  );

  if (f.date === "today") {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    out = out.filter((r) => Number(r.createdAt || 0) >= start);
  } else if (f.date === "7d" || f.date === "30d") {
    const days = f.date === "7d" ? 7 : 30;
    const start = nowMs - days * 24 * 60 * 60 * 1000;
    out = out.filter((r) => Number(r.createdAt || 0) >= start);
  }

  if (f.severity === "low") {
    out = out.filter((r) => String(r.severity || "").toLowerCase() === "low");
  } else if (f.severity === "moderate") {
    out = out.filter((r) => ["moderate", "medium"].includes(String(r.severity || "").toLowerCase()));
  } else if (f.severity === "high") {
    out = out.filter((r) => ["high", "critical"].includes(String(r.severity || "").toLowerCase()));
  }

  if (f.type && f.type !== "all") {
    out = out.filter((r) => (hazardTypeMeta(r.type)?.value || r.type) === f.type);
  }
  if (f.status && f.status !== "all") {
    out = out.filter((r) => normalizeStatus(r.status) === f.status);
  }
  if (f.priority && f.priority !== "all") {
    const bands = new Map();
    for (const e of rankRepairs(out, { now: nowMs })) {
      if (e && e.report && e.report.id != null) bands.set(e.report.id, e.band?.key);
    }
    out = out.filter((r) => bands.get(r.id) === f.priority);
  }
  if (f.location && f.location !== "all") {
    out = out.filter((r) => gridCellKey(r.coord) === f.location);
  }
  return out;
}
