/**
 * Geographic clustering for duplicate pothole reports.
 *
 * Groups reports that fall within a configurable distance of each other into
 * hazard clusters. Individual reports are never merged, modified or deleted —
 * clusters are a view over the original submissions.
 *
 * The algorithm is greedy and deterministic: reports are processed in input
 * order and joined to the first cluster whose current centroid is within the
 * threshold; a report that matches no cluster starts a new one.
 */
import { distMeters, isValidCoord } from "../routing/geo";

/** Default geographic threshold for "same hazard" (meters). */
const DEFAULT_CLUSTER_THRESHOLD_METERS = 50;

const SEVERITY_RANK = { high: 3, moderate: 2, low: 1 };

/**
 * Cluster reports by geographic proximity.
 *
 * @param {Array<Object>} reports report objects with `coord: [lng, lat]`
 * @param {Object} [opts]
 * @param {number} [opts.thresholdMeters] max distance from cluster centroid
 * @param {string|null} [opts.groupBy] report field that must match for two
 *   reports to cluster (e.g. "type" so a pothole never merges with a
 *   fallen tree). Legacy missing values group as "pothole".
 * @returns {Array<{id:string, coord:number[], reports:Array, count:number, severity:string}>}
 */
export function clusterReports(reports, { thresholdMeters = DEFAULT_CLUSTER_THRESHOLD_METERS, groupBy = null } = {}) {
  const clusters = [];
  if (!Array.isArray(reports)) return clusters;
  const keyOf = (r) => (groupBy ? String(r?.[groupBy] ?? "pothole") : "");

  for (const rep of reports) {
    if (!isValidCoord(rep?.coord)) continue;
    const key = keyOf(rep);
    let target = null;
    for (const c of clusters) {
      if (c.key === key && distMeters(c.coord, rep.coord) <= thresholdMeters) {
        target = c;
        break;
      }
    }
    if (!target) {
      target = {
        key,
        id: `cluster-${rep.id}`,
        coord: [Number(rep.coord[0]), Number(rep.coord[1])],
        reports: [],
        sumLng: 0,
        sumLat: 0,
      };
      clusters.push(target);
    }
    target.reports.push(rep);
    target.sumLng += Number(rep.coord[0]);
    target.sumLat += Number(rep.coord[1]);
    const n = target.reports.length;
    target.coord = [target.sumLng / n, target.sumLat / n];
  }

  for (const c of clusters) {
    c.count = c.reports.length;
    c.severity = c.reports.reduce(
      (max, r) => ((SEVERITY_RANK[r?.severity] || 0) > (SEVERITY_RANK[max] || 0) ? r.severity : max),
      "low"
    );
    delete c.sumLng;
    delete c.sumLat;
    delete c.key;
  }
  return clusters;
}
