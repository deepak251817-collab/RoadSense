/**
 * Road segment risk analysis.
 *
 * Splits a Mapbox route into contiguous segments (geometry is never
 * modified — segments are views over the original coordinates) and scores
 * each segment with the centralized safety engine using only data that
 * actually exists: reports/incidents near the segment, weather samples,
 * Mapbox congestion runs and time of day.
 *
 * Missing inputs are excluded from the weighted score (never guessed) and
 * surfaced through the confidence level of calculateRoadSafetyScore.
 */
import {
  calculateRoadSafetyScore,
  calculateTrafficRisk,
  calculatePotholeRisk,
  calculateRoadConditionRisk,
  calculateWeatherRisk,
  calculateIncidentRisk,
  calculateTimeRisk,
} from "./safetyScore";
import { isPotholeType } from "./hazardTypes";
import {
  pointLineDistMeters,
  distMeters,
  cumulativeDistances,
  isValidCoord,
} from "./geo";

/** Segment configuration (deterministic). */
export const SEGMENT_CONFIG = {
  targetSegmentMeters: 500, // aim for ~500 m segments
  minSegments: 4,
  maxSegments: 12,
  reportThresholdMeters: 120, // hazard proximity to a segment
  incidentThresholdMeters: 150,
  weatherPickMeters: 2000, // nearest weather sample within 2 km counts
};

/** Risk label bands shared with the map layer colors (Phase 6). */
export const SEGMENT_BANDS = [
  { key: "safe", label: "Safe", min: 75, color: "#22c55e" },
  { key: "moderate", label: "Moderate", min: 60, color: "#eab308" },
  { key: "risky", label: "Risky", min: 40, color: "#f97316" },
  { key: "high-risk", label: "High Risk", min: 0, color: "#ef4444" },
];

/** Classify a segment score into a risk band. */
export function classifySegment(score) {
  if (!Number.isFinite(score)) return SEGMENT_BANDS[SEGMENT_BANDS.length - 1];
  return SEGMENT_BANDS.find((b) => score >= b.min) ?? SEGMENT_BANDS[SEGMENT_BANDS.length - 1];
}

/**
 * Split route geometry into contiguous segments of ~targetSegmentMeters.
 * Coordinates are shared between adjacent segments so lines join seamlessly.
 *
 * @param {Object} route Mapbox route
 * @param {Object} [cfg] override SEGMENT_CONFIG
 * @returns {Array<{index:number, coords:Array, startMeters:number, endMeters:number}>}
 */
export function splitRouteIntoSegments(route, cfg = {}) {
  const config = { ...SEGMENT_CONFIG, ...cfg };
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return [];

  const cum = cumulativeDistances(coords);
  const total = cum[cum.length - 1] || 0;
  if (!Number.isFinite(total) || total <= 0) return [];

  let count = Math.round(total / config.targetSegmentMeters);
  count = Math.max(config.minSegments, Math.min(config.maxSegments, count));
  count = Math.min(count, coords.length - 1); // never more segments than edges

  const segments = [];
  let coordIdx = 0;
  for (let s = 0; s < count; s += 1) {
    const targetEnd = (total * (s + 1)) / count;
    let endIdx = coordIdx;
    while (endIdx < cum.length - 1 && cum[endIdx] < targetEnd) endIdx += 1;
    // Ensure at least one edge per segment
    if (endIdx <= coordIdx) endIdx = Math.min(coordIdx + 1, cum.length - 1);
    segments.push({
      index: s,
      coords: coords.slice(coordIdx, endIdx + 1),
      startMeters: Math.round(cum[coordIdx]),
      endMeters: Math.round(cum[endIdx]),
    });
    coordIdx = endIdx; // share boundary coordinate with the next segment
  }
  // Merge degenerate trailing segments (fewer than 2 points cannot render)
  return segments.filter((sg) => sg.coords.length >= 2);
}

/** Distance from a coordinate to a segment's polyline (Infinity if invalid). */
function distToSegment(coord, segCoords) {
  if (!isValidCoord(coord)) return Infinity;
  return pointLineDistMeters(coord, segCoords);
}

/**
 * Score one route segment.
 *
 * @param {Object} segment from splitRouteIntoSegments
 * @param {Object} ctx analysis context
 * @param {Array}  [ctx.reports] user hazard reports (all)
 * @param {Array}  [ctx.incidents] route incidents with coords (null = source unavailable)
 * @param {boolean}[ctx.showFixed] include fixed reports in proximity scan
 * @param {boolean}[ctx.adminMode] admin visibility
 * @param {Array}  [ctx.weatherPoints] weather samples {label, coord, data}
 * @param {Array}  [ctx.congestionSegments] Mapbox congestion features
 * @param {{risk:number, estimated:boolean, available:boolean}} [ctx.routeTraffic]
 *   route-level traffic fallback when no congestion detail exists
 * @param {Date}   [ctx.now]
 * @returns {Object} segment analysis record
 */
export function analyzeSegment(segment, ctx = {}) {
  const {
    reports = [],
    incidents = null,
    showFixed = true,
    adminMode = false,
    weatherPoints = [],
    congestionSegments = [],
    routeTraffic = { risk: null, estimated: false, available: false },
    now = new Date(),
  } = ctx;

  const segCoords = segment?.coords || [];
  const lengthMeters = Math.max(1, (segment?.endMeters ?? 0) - (segment?.startMeters ?? 0));

  // --- Hazards (user reports) near this segment -------------------------
  const nearReports = [];
  for (const rep of reports) {
    if (!isValidCoord(rep?.coord)) continue;
    if (rep.hiddenGlobally) continue;
    if (rep.status === "rejected") continue;
    if (rep.hiddenForUser && !adminMode) continue;
    if (rep.status === "fixed" && !showFixed) continue;
    const d = distToSegment(rep.coord, segCoords);
    if (isFinite(d) && d <= SEGMENT_CONFIG.reportThresholdMeters) nearReports.push(rep);
  }
  const activeReports = nearReports.filter((r) => r.status !== "fixed");
  const activePotholes = activeReports.filter((r) => isPotholeType(r.type));
  const activeConditions = activeReports.filter((r) => !isPotholeType(r.type));
  const highCount = activePotholes.filter((r) => r.severity === "high").length;
  const conditionHighCount = activeConditions.filter((r) => r.severity === "high").length;

  // --- Incidents near this segment (coord-tagged sources only) ----------
  const incidentsAvailable = Array.isArray(incidents);
  const nearIncidents = incidentsAvailable
    ? incidents.filter((i) => {
        const d = distToSegment(i?.coord, segCoords);
        return isFinite(d) && d <= SEGMENT_CONFIG.incidentThresholdMeters;
      })
    : [];

  // --- Weather: nearest sample within range -----------------------------
  let weatherPoint = null;
  let weatherDist = Infinity;
  for (const p of weatherPoints || []) {
    const d = distToSegment(p?.coord, segCoords);
    if (d < weatherDist) { weatherDist = d; weatherPoint = p; }
  }
  const weatherUse =
    weatherPoint && weatherDist <= SEGMENT_CONFIG.weatherPickMeters ? weatherPoint : null;
  const weatherRisk = weatherUse ? calculateWeatherRisk([weatherUse]) : null;

  // --- Traffic: congestion runs overlapping the segment, else fallback ---
  const congLevels = [];
  for (const f of congestionSegments || []) {
    const line = f?.geometry?.coordinates;
    if (!Array.isArray(line) || line.length < 2) continue;
    const d = pointLineDistMeters(segCoords[0], line);
    // Overlap heuristic: run start within one segment length of this segment
    if (isFinite(d) && d <= Math.max(80, lengthMeters)) {
      const level = f?.properties?.congestion;
      if (level && level !== "unknown") congLevels.push(level);
    }
  }
  let traffic;
  if (congLevels.length) {
    const risk = calculateTrafficRisk({ congestionLevels: congLevels });
    traffic = { risk, available: risk != null, estimated: false, source: "mapbox-congestion" };
  } else {
    traffic = {
      risk: routeTraffic.available ? routeTraffic.risk : null,
      available: Boolean(routeTraffic.available),
      estimated: Boolean(routeTraffic.estimated),
      source: routeTraffic.available ? "route-level" : "unavailable",
    };
  }

  // --- Time (same instant for every segment) ----------------------------
  const timeRisk = calculateTimeRisk(now);

  // --- Score through the centralized engine -----------------------------
  const result = calculateRoadSafetyScore({
    traffic: traffic.available ? { risk: traffic.risk, estimated: traffic.estimated } : null,
    weather: weatherRisk,
    potholes: calculatePotholeRisk({
      count: activePotholes.length,
      highSeverityCount: highCount,
      distanceMeters: lengthMeters,
    }),
    incidents: incidentsAvailable
      ? calculateIncidentRisk(nearIncidents, { available: true })
      : null,
    accidents: null, // segment-level accident split not available from sources
    roadCondition: calculateRoadConditionRisk({
      count: activeConditions.length,
      highSeverityCount: conditionHighCount,
      distanceMeters: lengthMeters,
    }),
    timeRisk,
  });

  const band = classifySegment(result.score);

  // --- Human-readable explanation ---------------------------------------
  const explanation = [];
  if (activeReports.length) {
    explanation.push(`${activeReports.length} active hazard report${activeReports.length > 1 ? "s" : ""} within ${SEGMENT_CONFIG.reportThresholdMeters} m (${activePotholes.length} pothole, ${activeConditions.length} condition${highCount || conditionHighCount ? `, ${highCount + conditionHighCount} high severity` : ""})`);
  }
  if (incidentsAvailable && nearIncidents.length) {
    explanation.push(`${nearIncidents.length} incident${nearIncidents.length > 1 ? "s" : ""} near this segment`);
  }
  if (congLevels.length) explanation.push(`Traffic: ${congLevels.join(", ")} congestion`);
  else if (traffic.available && traffic.estimated) explanation.push("Traffic estimated from route speeds");
  else if (traffic.available) explanation.push("Traffic risk from route-level data");
  else explanation.push("Traffic data unavailable for this segment");
  if (weatherUse) explanation.push(`Weather at ${weatherUse.label}: ${weatherUse.data?.weather?.[0]?.description || "—"}`);
  else explanation.push("No weather sample near this segment");
  explanation.push(`Time of day: ${result.factors.time?.risk ?? "—"}`);

  return {
    index: segment.index,
    coords: segCoords,
    startMeters: segment.startMeters,
    endMeters: segment.endMeters,
    lengthMeters,
    score: result.score,
    classification: result.classification,
    band,
    factors: result.factors,
    confidence: result.confidence,
    hazards: { reports: nearReports, incidents: nearIncidents },
    traffic,
    weather: {
      risk: weatherRisk,
      label: weatherUse ? weatherUse.label : null,
      condition: weatherUse?.data?.weather?.[0]?.description || null,
      available: Boolean(weatherUse),
    },
    explanation,
  };
}

/**
 * Analyze every segment of a route.
 *
 * @param {Object} route Mapbox route
 * @param {Object} ctx see analyzeSegment
 * @returns {Array<Object>} segment analyses in route order
 */
export function analyzeRouteSegments(route, ctx = {}) {
  const segments = splitRouteIntoSegments(route);
  return segments.map((sg) => analyzeSegment(sg, ctx));
}
