/**
 * Hazard hotspots.
 *
 * A hotspot is a geographic zone where several *active* hazards concentrate.
 * Zones are found by clustering reports with a much larger radius than the
 * duplicate-detection threshold (duplicate clusters show one pin; hotspots
 * rank areas for attention). A zone with only fixed/rejected reports is not
 * a hotspot — it is proof the problem was solved there.
 *
 * Output is deterministic: same input → same ranking.
 */
import { clusterReports } from "./clustering";
import { distMeters, isValidCoord } from "./geo";
import { isActiveStatus, normalizeStatus } from "./hazardLifecycle";

export const HOTSPOT_CONFIG = {
  /** Zone radius: reports within this distance of each other share a zone. */
  thresholdMeters: 150,
  /** A single report is a data point, not a hotspot. */
  minReports: 2,
  /** Cap the ranked list so the UI stays readable. */
  maxHotspots: 8,
  /** "Recent activity" window for the trend signal. */
  recentDays: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Score one hotspot zone 0..100 from active count, high severity, and recency.
 *
 * @param {{reports:Array}} zone clustered reports
 * @param {number} now timestamp
 * @returns {number} 0..100
 */
function scoreZone(zone, now, includeFixed = false) {
  const active = zone.reports.filter(
    (r) =>
      (isActiveStatus(r?.status) || includeFixed) &&
      !r?.hiddenGlobally &&
      isValidCoord(r?.coord)
  );
  const activeCount = active.length;
  const highCount = active.filter((r) => String(r?.severity).toLowerCase() === "high").length;
  const recentCount = active.filter((r) => {
    const ts = Number(r?.captureAt || r?.createdAt || 0);
    return ts > 0 && now - ts <= HOTSPOT_CONFIG.recentDays * DAY_MS;
  }).length;

  // 0..40 count, 0..35 severity, 0..25 recency → capped at 100
  const score =
    Math.min(40, activeCount * 10) +
    Math.min(35, highCount * 17.5) +
    Math.min(25, recentCount * 12.5);
  return Math.min(100, Math.round(score));
}

/**
 * Detect and rank hazard hotspots.
 *
 * @param {Array} reports user pothole reports
 * @param {Object} [opts]
 * @param {number} [opts.now] fixed timestamp for deterministic recency
 * @param {boolean} [opts.includeFixed] treat fixed hazards as active too
 * @returns {Array<{id:string, coord:number[], count:number, activeCount:number,
 *   highCount:number, recentCount:number, score:number, radiusMeters:number,
 *   severity:string, label:string}>} ranked best-first
 */
export function detectHotspots(reports, { now = Date.now(), includeFixed = false } = {}) {
  if (!Array.isArray(reports) || !reports.length) return [];

  // Only hazards that still affect the road can form a hotspot.
  const candidates = reports.filter((r) => {
    if (!isValidCoord(r?.coord) || r?.hiddenGlobally) return false;
    const status = normalizeStatus(r?.status);
    if (status === "rejected") return false;
    if (status === "fixed" && !includeFixed) return false;
    return true;
  });
  if (candidates.length < HOTSPOT_CONFIG.minReports) return [];

  // Sort by id first so zone formation (and thus the ranking) does not
  // depend on the order reports happen to sit in the array.
  candidates.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const zones = clusterReports(candidates, { thresholdMeters: HOTSPOT_CONFIG.thresholdMeters });

  const hotspots = [];
  for (const zone of zones) {
    const active = zone.reports.filter((r) => isActiveStatus(r?.status) || includeFixed);
    if (active.length < HOTSPOT_CONFIG.minReports) continue;

    // Zone radius: farthest member from the centroid (0 when single/identical).
    let radiusMeters = 0;
    for (const r of zone.reports) {
      const d = distMeters(zone.coord, r.coord);
      if (d > radiusMeters) radiusMeters = d;
    }

    const highCount = active.filter(
      (r) => String(r?.severity).toLowerCase() === "high"
    ).length;
    const recentCount = active.filter((r) => {
      const ts = Number(r?.captureAt || r?.createdAt || 0);
      return ts > 0 && now - ts <= HOTSPOT_CONFIG.recentDays * DAY_MS;
    }).length;

    const score = scoreZone(zone, now, includeFixed);
    hotspots.push({
      id: zone.id,
      coord: zone.coord,
      count: zone.reports.length,
      activeCount: active.length,
      highCount,
      recentCount,
      score,
      radiusMeters: Math.round(radiusMeters),
      severity: highCount > 0 ? "high" : zone.severity,
      label:
        highCount > 0
          ? `${active.length} active hazards · ${highCount} high severity`
          : `${active.length} active hazards`,
    });
  }

  // Deterministic ranking: score → active count → stable id tiebreak
  hotspots.sort(
    (a, b) => b.score - a.score || b.activeCount - a.activeCount || String(a.id).localeCompare(String(b.id))
  );
  return hotspots.slice(0, HOTSPOT_CONFIG.maxHotspots);
}
