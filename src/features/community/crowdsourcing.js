/**
 * Multi-user crowdsourced road hazard intelligence (Phase 24).
 *
 * Several people can report the same physical hazard. This module aggregates
 * those contributions — duplicate detection on submission, confirmations from
 * further users, and cluster summaries (count, severities, timestamps) —
 * WITHOUT ever promoting a crowdsourced report to "verified".
 *
 * Verification stays an explicit administrative action (hazardLifecycle
 * statuses + admin session in services/hazardService). More evidence only ever
 * raises the report's own system confidence (utils/confidence), never its
 * lifecycle status.
 *
 * Duplicate rule (from the V3 spec): reports within 20 meters — of the same
 * hazard type — belong to one cluster; a cluster of 5+ reports is flagged as
 * a likely duplicate group. Both thresholds are configurable.
 */
import { distMeters } from "../routing/geo";
import { normalizeStatus } from "../admin/hazardLifecycle";

/** Distance at which two reports are considered the same location. */
export const DUPLICATE_THRESHOLD_METERS = 20;
/** Cluster size from which a group is labelled a likely duplicate hazard. */
export const DUPLICATE_CLUSTER_MIN_REPORTS = 5;
/** Cap on stored confirmations per report (keeps records bounded). */
export const MAX_CONFIRMATIONS = 20;
/**
 * Hard rule: crowdsourced evidence NEVER auto-verifies a hazard.
 * Read by the UI/tests to assert the invariant.
 */
export const AUTOMATIC_VERIFICATION = false;

const SEVERITY_RANK = { low: 1, moderate: 2, high: 3 };
const rank = (sev) => SEVERITY_RANK[String(sev || "").toLowerCase()] || 0;

/** Highest severity of two values (ties/unknowns keep the known one). */
export function highestSeverity(a, b) {
  return rank(b) > rank(a) ? b || "moderate" : a || "moderate";
}

/**
 * Reports that can still take part in aggregation: real, visible and not yet
 * fixed/rejected. Fixed and rejected reports are historical facts, not
 * evidence of a current hazard.
 */
export function isEligibleReport(report) {
  if (!report || typeof report !== "object") return false;
  if (!Array.isArray(report.coord) || report.coord.length < 2) return false;
  if (report.hiddenGlobally || report.hiddenForUser) return false;
  return !["fixed", "rejected"].includes(normalizeStatus(report.status));
}

/**
 * Nearest eligible report within `thresholdMeters` of a coordinate.
 *
 * @param {Array} reports
 * @param {number[]} coord [lng, lat] of the new report
 * @param {Object} [opts]
 * @param {number} [opts.thresholdMeters]
 * @param {*} [opts.excludeId] report id to skip
 * @param {boolean} [opts.sameTypeOnly] require the same hazard type
 * @param {string|null} [opts.type] hazard type required when sameTypeOnly
 * @returns {{report:Object, distanceMeters:number}|null}
 */
export function findNearbyReport(
  reports,
  coord,
  {
    thresholdMeters = DUPLICATE_THRESHOLD_METERS,
    excludeId = null,
    sameTypeOnly = false,
    type = null,
  } = {}
) {
  if (!Array.isArray(reports) || !Array.isArray(coord) || coord.length < 2) return null;
  const wanted = type != null ? String(type) : null;
  let best = null;
  for (const r of reports) {
    if (!isEligibleReport(r)) continue;
    if (excludeId != null && r.id === excludeId) continue;
    if (sameTypeOnly && (wanted == null || String(r.type || "pothole") !== wanted)) continue;
    const d = distMeters(coord, r.coord);
    if (!Number.isFinite(d) || d > thresholdMeters) continue;
    if (!best || d < best.distanceMeters) best = { report: r, distanceMeters: Math.round(d) };
  }
  return best;
}

/**
 * Nearest eligible report of the SAME hazard type within the threshold.
 * (Convenience wrapper used by the submit flow.)
 *
 * @param {Array} reports
 * @param {{coord?:number[], type?:string, id?:*}} incoming
 * @param {Object} [opts] overrides (thresholdMeters)
 * @returns {{report:Object, distanceMeters:number}|null}
 */
export function findDuplicateCandidate(reports, incoming, opts = {}) {
  if (!incoming || !Array.isArray(incoming.coord)) return null;
  return findNearbyReport(reports, incoming.coord, {
    thresholdMeters: opts.thresholdMeters ?? DUPLICATE_THRESHOLD_METERS,
    excludeId: incoming.id ?? null,
    sameTypeOnly: true,
    type: incoming.type || "pothole",
  });
}

/** Number of confirmations recorded on a report. */
export function confirmationCount(report) {
  return Array.isArray(report?.confirmations) ? report.confirmations.length : 0;
}

/**
 * Append a confirmation from another user. Status is intentionally untouched:
 * extra evidence improves confidence, never verification.
 *
 * @param {Object} report
 * @param {Object} [conf] {at, source, note}
 * @returns {Object} new report object
 */
export function addConfirmation(report, { at = Date.now(), source = "user", note = null } = {}) {
  if (!report || typeof report !== "object") return report;
  const prev = Array.isArray(report.confirmations) ? report.confirmations : [];
  const entry = { at: Number(at) || Date.now(), source: String(source || "user") };
  if (note) entry.note = String(note).slice(0, 200);
  return {
    ...report,
    confirmations: [...prev, entry].slice(-MAX_CONFIRMATIONS),
    lastConfirmedAt: entry.at,
    // status intentionally NOT modified (AUTOMATIC_VERIFICATION === false)
    status: report.status,
  };
}

/**
 * Fold a duplicate submission into the existing report it matches: raises
 * severity to the highest reported, records the extra evidence and bumps the
 * related-report counter. The lifecycle status is never changed here.
 *
 * @param {Object} existing
 * @param {Object} incoming new report that duplicates `existing`
 * @param {Object} [opts] {at}
 * @returns {Object} new report object
 */
export function mergeDuplicateReport(existing, incoming, { at = Date.now() } = {}) {
  if (!existing || typeof existing !== "object") return existing;
  const incomingId = incoming?.id ?? null;
  const evidenceIds = Array.isArray(existing.evidenceIds) ? existing.evidenceIds.slice() : [];
  if (!evidenceIds.length && existing.id != null) evidenceIds.push(existing.id);
  if (incomingId != null && !evidenceIds.includes(incomingId)) evidenceIds.push(incomingId);

  const merged = addConfirmation(existing, {
    at,
    source: "duplicate-report",
    note: incomingId != null ? `Linked report ${incomingId}` : null,
  });

  return {
    ...merged,
    severity: highestSeverity(existing.severity, incoming?.severity),
    relatedReportCount: Math.max(1, Number(existing.relatedReportCount) || 1) + 1,
    evidenceIds,
    // Keep the original status — crowdsourced duplicates never auto-verify.
    status: existing.status,
  };
}

/**
 * Summary of a cluster of reports describing one hazard.
 *
 * @param {Array} reports
 * @returns {{reportCount:number, confirmations:number, severity:string|null,
 *   firstReportedAt:number|null, lastReportedAt:number|null, likelyDuplicate:boolean}}
 */
export function summarizeCluster(reports) {
  const list = (Array.isArray(reports) ? reports : []).filter(
    (r) => r && typeof r === "object"
  );
  if (!list.length) {
    return {
      reportCount: 0,
      confirmations: 0,
      severity: null,
      firstReportedAt: null,
      lastReportedAt: null,
      likelyDuplicate: false,
    };
  }
  let severity = null;
  let first = null;
  let last = null;
  let confirmations = 0;
  let reportCount = 0;
  for (const r of list) {
    severity = severity == null ? r.severity || null : highestSeverity(severity, r.severity);
    confirmations += confirmationCount(r);
    // relatedReportCount already includes the record itself (1 when none).
    reportCount += Math.max(1, Number(r.relatedReportCount) || 1);
    const ts = Number(r.createdAt || r.captureAt);
    if (Number.isFinite(ts)) {
      if (first == null || ts < first) first = ts;
      if (last == null || ts > last) last = ts;
    }
  }
  return {
    reportCount,
    confirmations,
    severity,
    firstReportedAt: first,
    lastReportedAt: last,
    likelyDuplicate: reportCount >= DUPLICATE_CLUSTER_MIN_REPORTS,
  };
}

/** True when a cluster has reached the likely-duplicate size. */
export function likelyDuplicate(reportCount) {
  return Number(reportCount) >= DUPLICATE_CLUSTER_MIN_REPORTS;
}
