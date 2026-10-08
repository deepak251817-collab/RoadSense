/**
 * Safety heatmap data.
 *
 * Turns hazard reports into weighted GeoJSON points that Mapbox renders as a
 * heatmap layer. Weight = severity × recency × status, clamped to 0..1.
 * Rejected and (unless shown) fixed hazards contribute nothing — the heatmap
 * must reflect where danger currently is, not where it used to be.
 */
import { normalizeStatus } from "../admin/hazardLifecycle";

/** Severity contribution to local hazard intensity. */
export const HEATMAP_SEVERITY_WEIGHTS = {
  high: 1,
  moderate: 0.55,
  low: 0.25,
};

/** Unknown severity gets a neutral mid-low contribution. */
const DEFAULT_SEVERITY_WEIGHT = 0.4;

/** Recency decay: full weight for recent hazards, faded for old ones. */
const FULL_WEIGHT_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FADE_END_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

/**
 * Heatmap weight for one report (0..1). Returns 0 when the report must not
 * influence the heatmap (rejected, hidden, or fixed while hidden).
 *
 * @param {Object} report user pothole report
 * @param {Object} [opts]
 * @param {boolean} [opts.includeFixed] count fixed hazards too (admin "show fixed")
 * @param {number} [opts.now] timestamp for deterministic recency
 * @returns {number} 0..1
 */
export function reportHeatmapWeight(report, { includeFixed = false, now = Date.now() } = {}) {
  if (!report || !Array.isArray(report.coord)) return 0;
  if (report.hiddenGlobally) return 0;

  const status = normalizeStatus(report.status);
  if (status === "rejected") return 0;
  if (status === "fixed" && !includeFixed) return 0;

  const sevKey = String(report.severity || "").toLowerCase();
  const severityWeight = HEATMAP_SEVERITY_WEIGHTS[sevKey] ?? DEFAULT_SEVERITY_WEIGHT;

  // Recency: full weight until FULL_WEIGHT_AGE_MS, then linear fade to 0 at
  // FADE_END_AGE_MS (a year-old report still shows, but faintly).
  const ts = Number(report.captureAt || report.createdAt || 0);
  const age = ts > 0 ? Math.max(0, now - ts) : 0;
  let recency = 1;
  if (age > FULL_WEIGHT_AGE_MS) {
    recency = Math.max(0, 1 - (age - FULL_WEIGHT_AGE_MS) / (FADE_END_AGE_MS - FULL_WEIGHT_AGE_MS));
  }

  const weight = severityWeight * recency;
  return Math.min(1, Math.max(0, Number.isFinite(weight) ? weight : 0));
}

/**
 * Build a GeoJSON FeatureCollection of weighted points for the heatmap layer.
 * Feature order follows the input order (deterministic; Mapbox does not care).
 *
 * @param {Array} reports user pothole reports
 * @param {Object} [opts]
 * @param {boolean} [opts.includeFixed]
 * @param {number} [opts.now]
 * @returns {{type:'FeatureCollection', features:Array}} points with {weight, severity, status}
 */
export function buildSafetyHeatmapData(reports, { includeFixed = false, now = Date.now() } = {}) {
  const features = [];
  if (!Array.isArray(reports)) return { type: "FeatureCollection", features };

  for (const report of reports) {
    const weight = reportHeatmapWeight(report, { includeFixed, now });
    if (weight <= 0) continue;
    const lng = Number(report.coord[0]);
    const lat = Number(report.coord[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        weight,
        severity: String(report.severity || "unknown").toLowerCase(),
        status: normalizeStatus(report.status),
      },
    });
  }

  return { type: "FeatureCollection", features };
}
