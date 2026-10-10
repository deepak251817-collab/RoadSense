/**
 * Change detection over the stored hazard reports.
 *
 * A descriptive comparison between the LIVE report database and a stored
 * baseline snapshot: which hazards appeared, which got fixed, which were
 * removed, and how the road health index moved. It only ever reports
 * differences between two real snapshots — it never predicts anything.
 *
 * Honesty rules:
 *   - INSUFFICIENT-HISTORY GUARD: with no stored baseline, or a baseline
 *     younger than CHANGE_MIN_BASELINE_AGE_MS, the result is
 *     `insufficientHistory: true` with an explanation — no deltas, no
 *     direction, no claims. An hour-old baseline is simply not history.
 *   - Report IDs missing on either side fall back to count-based deltas
 *     and say so (`countsOnly`), instead of inventing identities.
 *   - The result carries CHANGE_LABEL ("Report-based comparison") so the
 *     UI can never present it as sensor data or a prediction.
 */
import { roadHealthIndex, classifyRoadHealth } from "./roadHealth";

/** localStorage key for the daily baseline snapshots. */
const CHANGE_SNAPSHOT_KEY = "roadChangeSnapshots";

/** Display label that must accompany every change number in the UI. */
export const CHANGE_LABEL = "Report-based comparison";

/** Snapshots kept (one per calendar day). */
const CHANGE_MAX_SNAPSHOTS = 30;

/**
 * Minimum age of the earliest baseline before any trend may be claimed.
 * Younger baselines → insufficient history.
 */
const CHANGE_MIN_BASELINE_AGE_MS = 60 * 60 * 1000; // 1 hour

/** Local calendar-day key for a timestamp. */
export function dateKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Capture a baseline snapshot of the report database.
 *
 * @param {Array} reports all user reports
 * @param {Date|number} [now] capture time
 * @returns {{at:number, dateKey:string, total:number, active:number,
 *   fixed:number, rejected:number, hidden:number, highActive:number,
 *   activeIds:string[], fixedIds:string[], healthIndex:number|null,
 *   gradeKey:string}}
 */
export function captureReportSnapshot(reports = [], now = Date.now()) {
  const at = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const list = Array.isArray(reports) ? reports : [];
  const activeIds = [];
  const fixedIds = [];
  let total = 0;
  let active = 0;
  let fixed = 0;
  let rejected = 0;
  let hidden = 0;
  let highActive = 0;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    total += 1;
    const id = r.id != null ? String(r.id) : null;
    if (r.hiddenGlobally) {
      hidden += 1;
      continue;
    }
    if (r.status === "rejected") {
      rejected += 1;
      continue;
    }
    if (r.status === "fixed") {
      fixed += 1;
      if (id) fixedIds.push(id);
      continue;
    }
    active += 1;
    if (id) activeIds.push(id);
    const sev = String(r.severity || "").toLowerCase();
    if (sev === "high" || sev === "critical") highActive += 1;
  }
  const health = roadHealthIndex({ reports: list });
  return {
    at,
    dateKey: dateKey(at),
    total,
    active,
    fixed,
    rejected,
    hidden,
    highActive,
    activeIds,
    fixedIds,
    healthIndex: health.index,
    gradeKey: health.grade.key,
  };
}

/**
 * Merge a snapshot into the stored list: one entry per calendar day
 * (latest state of that day wins), capped and sorted oldest-first.
 * Returns the SAME array reference when nothing changes, so callers can
 * skip persistence.
 *
 * @param {Array} snapshots existing stored snapshots
 * @param {Object} snap new snapshot
 * @returns {Array}
 */
export function mergeChangeSnapshot(snapshots, snap) {
  const list = Array.isArray(snapshots) ? snapshots.filter((s) => s && s.dateKey) : [];
  if (!snap || !snap.dateKey) return list.length ? list : snapshots;
  const existingIdx = list.findIndex((s) => s.dateKey === snap.dateKey);
  if (existingIdx >= 0) {
    const existing = list[existingIdx];
    const same =
      existing.active === snap.active &&
      existing.fixed === snap.fixed &&
      existing.rejected === snap.rejected &&
      existing.hidden === snap.hidden &&
      existing.highActive === snap.highActive &&
      existing.healthIndex === snap.healthIndex &&
      existing.activeIds.join(",") === snap.activeIds.join(",") &&
      existing.fixedIds.join(",") === snap.fixedIds.join(",");
    if (same) return snapshots; // no change → keep reference, skip write
    const next = list.slice();
    next[existingIdx] = snap;
    next.sort((a, b) => a.at - b.at);
    return next.slice(-CHANGE_MAX_SNAPSHOTS);
  }
  const next = list.concat([snap]);
  next.sort((a, b) => a.at - b.at);
  return next.slice(-CHANGE_MAX_SNAPSHOTS);
}

/** Load snapshots from storage (tolerates missing/corrupt data). */
export function loadChangeSnapshots(storage = null) {
  try {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return [];
    const raw = s.getItem(CHANGE_SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.at === "number" && typeof x.dateKey === "string").sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

/** Persist snapshots to storage (best-effort). */
export function saveChangeSnapshots(snapshots, storage = null) {
  try {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return false;
    s.setItem(CHANGE_SNAPSHOT_KEY, JSON.stringify(snapshots));
    return true;
  } catch {
    return false;
  }
}

/** IDs that appear in `b` but not in `a`. */
const diffIds = (a, b) => b.filter((id) => !a.includes(id));

/**
 * Compare the live database against the stored baseline.
 *
 * @param {Object} input
 * @param {Array}  [input.snapshots] stored baseline snapshots (oldest first)
 * @param {Array}  [input.reports] live reports
 * @param {number} [input.minBaselineAgeMs] override the history guard
 * @param {number|Date} [input.now] injectable clock
 * @returns {Object} either
 *   {insufficientHistory:true, reason, label} or
 *   {insufficientHistory:false, baseline, current, newCount, resolvedCount,
 *    removedCount, healthDelta, direction, countsOnly, reasons, label}
 */
export function detectChanges({ snapshots = [], reports = [], minBaselineAgeMs = CHANGE_MIN_BASELINE_AGE_MS, now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const label = CHANGE_LABEL;
  const list = Array.isArray(snapshots) ? snapshots.filter((s) => s && typeof s.at === "number") : [];
  // Baseline is the OLDEST snapshot regardless of input order
  const baseline = list.length ? list.reduce((oldest, s) => (s.at < oldest.at ? s : oldest)) : null;

  // --- Insufficient-history guard ----------------------------------------
  if (!baseline) {
    return {
      insufficientHistory: true,
      label,
      reason: "No baseline snapshot yet — a baseline is captured automatically; trends appear once there is history to compare against.",
      reasonCode: "no-baseline",
    };
  }
  const age = nowMs - baseline.at;
  if (!Number.isFinite(age) || age < minBaselineAgeMs) {
    return {
      insufficientHistory: true,
      label,
      reason: `Baseline captured ${Math.max(0, Math.round(age / 60000))} minute(s) ago — change detection needs at least ${Math.round(minBaselineAgeMs / 60000)} minutes of history before any comparison is meaningful.`,
      reasonCode: "baseline-too-recent",
      baselineAt: baseline.at,
    };
  }

  const current = captureReportSnapshot(reports, nowMs);

  // --- Identity-based deltas (with honest count-based fallback) -----------
  const baselineIds = Array.isArray(baseline.activeIds) ? baseline.activeIds : [];
  const currentActiveIds = Array.isArray(current.activeIds) ? current.activeIds : [];
  const baselineHadIds = baselineIds.length > 0 || baseline.active === 0;
  const countsOnly = !(baselineHadIds && Array.isArray(current.activeIds));

  let newCount = 0;
  let resolvedCount = 0;
  let removedCount = 0;
  if (!countsOnly) {
    // New: active now, not active in baseline (includes re-opened ones)
    newCount = diffIds(baselineIds, currentActiveIds).length;
    // Resolved: active in baseline, fixed now
    const currentFixedIds = Array.isArray(current.fixedIds) ? current.fixedIds : [];
    resolvedCount = baselineIds.filter((id) => currentFixedIds.includes(id)).length;
    // Removed: active in baseline, now neither active nor fixed
    // (rejected / deleted / hidden)
    removedCount = baselineIds.filter(
      (id) => !currentActiveIds.includes(id) && !(current.fixedIds || []).includes(id)
    ).length;
  } else {
    // Count-based fallback: individual identities are unavailable, so we
    // only decompose the net movement — active growth counts as new,
    // fixed growth counts as resolved, and any remaining active decline
    // counts as removed/rejected. The UI flags this mode.
    newCount = Math.max(0, current.active - baseline.active);
    const fixedGrowth = Math.max(0, current.fixed - baseline.fixed);
    resolvedCount = fixedGrowth;
    removedCount = Math.max(0, Math.max(0, baseline.active - current.active) - fixedGrowth);
  }

  // --- Health index delta --------------------------------------------------
  const healthDelta =
    Number.isFinite(baseline.healthIndex) && Number.isFinite(current.healthIndex)
      ? current.healthIndex - baseline.healthIndex
      : null;

  // --- Direction (explicit, documented rules) ------------------------------
  let direction = "stable";
  if (healthDelta != null && healthDelta !== 0) {
    direction = healthDelta > 0 ? "improved" : "worsened";
  } else if (healthDelta == null) {
    const netActive = current.active - baseline.active;
    if (netActive < 0) direction = "improved";
    else if (netActive > 0) direction = "worsened";
  }

  const reasons = [];
  reasons.push(`✓ Baseline from ${new Date(baseline.at).toLocaleDateString()} compared with today (${new Date(current.at).toLocaleDateString()})`);
  if (countsOnly) {
    reasons.push("⚠ Baseline lacks report IDs — deltas are count-based only");
  } else {
    reasons.push(`✓ ${newCount} new hazard${newCount === 1 ? "" : "s"} appeared since baseline`);
    reasons.push(`✓ ${resolvedCount} hazard${resolvedCount === 1 ? "" : "s"} marked fixed since baseline`);
    if (removedCount > 0) reasons.push(`✓ ${removedCount} report${removedCount === 1 ? "" : "s"} removed or rejected since baseline`);
  }
  if (healthDelta != null) {
    reasons.push(`✓ Road health index ${healthDelta > 0 ? "+" : ""}${healthDelta} (${baseline.healthIndex ?? "—"} → ${current.healthIndex})`);
  } else {
    reasons.push("⚠ Health index not comparable (insufficient data on one side)");
  }
  reasons.push(`✓ ${current.active} active / ${current.fixed} fixed now vs ${baseline.active} / ${baseline.fixed} at baseline`);

  return {
    insufficientHistory: false,
    label,
    baseline,
    current,
    newCount,
    resolvedCount,
    removedCount,
    healthDelta,
    direction,
    directionLabel:
      direction === "improved" ? "Improving" : direction === "worsened" ? "Worsening" : "No change",
    directionGrade: classifyRoadHealth(current.healthIndex),
    baselineHealthGrade: classifyRoadHealth(baseline.healthIndex),
    countsOnly,
    ageMs: age,
    reasons,
  };
}
