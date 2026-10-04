/**
 * Incident intelligence.
 *
 * Builds a factual incident list for a route from sources the app actually
 * has:
 *   1. Mapbox congestion annotations (real traffic data, when traffic was
 *      fetched for the route) → congestion incidents.
 *   2. Active user-reported hazards near the route (local report data).
 *   3. An optional external incident feed (GeoJSON) configured through
 *      VITE_INCIDENTS_URL — may carry accidents, construction, closures,
 *      lane restrictions, etc.
 *
 * Nothing is ever synthesized: when a source is unavailable it contributes no
 * incidents and is reported as unavailable.
 */
import { pointLineDistMeters, distMeters, isValidCoord } from "../utils/geo";

/** Supported incident types. */
export const INCIDENT_TYPES = {
  CONGESTION: "congestion",
  ACCIDENT: "accident",
  HAZARD: "hazard",
  CONSTRUCTION: "construction",
  CLOSURE: "closure",
  LANE_RESTRICTION: "lane_restriction",
  OTHER: "other",
};

/** Human labels for incident types. */
export const INCIDENT_TYPE_LABELS = {
  congestion: "Heavy traffic",
  accident: "Accident",
  hazard: "Road hazard",
  construction: "Construction",
  closure: "Road closure",
  lane_restriction: "Lane restriction",
  other: "Incident",
};

const SEVERITIES = ["low", "medium", "high", "critical"];
const CONGESTION_SEVERITY = { heavy: "high", severe: "critical" };
const REPORT_SEVERITY = { low: "low", moderate: "medium", high: "high" };

/** Normalize an arbitrary type string into a supported incident type. */
export function normalizeIncidentType(raw) {
  const t = String(raw || "").toLowerCase();
  if (/accident|collision|crash/.test(t)) return INCIDENT_TYPES.ACCIDENT;
  if (/lane|restrict/.test(t)) return INCIDENT_TYPES.LANE_RESTRICTION;
  if (/closur|closed|road\s*closed/.test(t)) return INCIDENT_TYPES.CLOSURE;
  if (/construct|roadwork|work\s*zone|maintenance/.test(t)) return INCIDENT_TYPES.CONSTRUCTION;
  if (/hazard|pothole|debris|flood|obstruction/.test(t)) return INCIDENT_TYPES.HAZARD;
  if (/congest|traffic|jam/.test(t)) return INCIDENT_TYPES.CONGESTION;
  return INCIDENT_TYPES.OTHER;
}

/** Normalize an arbitrary severity string. */
export function normalizeSeverity(raw, fallback = "medium") {
  const s = String(raw || "").toLowerCase();
  return SEVERITIES.includes(s) ? s : fallback;
}

/**
 * Merge consecutive congestion segments (same level) into per-run incidents.
 * Only heavy/severe runs become incidents; those levels come directly from
 * Mapbox congestion annotations.
 */
export function congestionRunsToIncidents(segments) {
  if (!Array.isArray(segments) || !segments.length) return [];
  const runs = [];
  let current = null;
  for (const seg of segments) {
    const level = String(seg?.properties?.congestion || "").toLowerCase();
    const coords = seg?.geometry?.coordinates;
    if (!CONGESTION_SEVERITY[level] || !Array.isArray(coords) || coords.length < 2) {
      current = null;
      continue;
    }
    if (current && current.level === level) {
      current.coords.push(coords[1]);
      current.segments += 1;
    } else {
      current = { level, coords: [coords[0], coords[1]], segments: 1 };
      runs.push(current);
    }
  }
  return runs.map((run, i) => {
    let lengthM = 0;
    for (let k = 0; k < run.coords.length - 1; k += 1) {
      const d = distMeters(run.coords[k], run.coords[k + 1]);
      if (Number.isFinite(d)) lengthM += d;
    }
    const mid = run.coords[Math.floor(run.coords.length / 2)];
    const severity = CONGESTION_SEVERITY[run.level];
    const label = run.level === "severe" ? "Severe" : "Heavy";
    return {
      id: `cong-${i}`,
      type: INCIDENT_TYPES.CONGESTION,
      severity,
      coord: mid,
      distanceFromRouteMeters: 0,
      description: `${label} congestion for about ${(lengthM / 1000).toFixed(1)} km on this route`,
      source: "mapbox-congestion",
    };
  });
}

/**
 * Build the incident list for one route.
 *
 * @param {Object} route Mapbox route object
 * @param {Object} opts
 * @param {Array}  [opts.congestionSegments] congestion GeoJSON segments for this route
 * @param {boolean}[opts.congestionAvailable] whether traffic annotations were fetched
 * @param {Array}  [opts.reports] user pothole reports
 * @param {boolean}[opts.showFixed] visibility filter (parity with map)
 * @param {boolean}[opts.adminMode] visibility filter (parity with map)
 * @param {{available:boolean, items:Array}} [opts.external] external incident feed
 * @returns {{incidents:Array, availableSources:string[]}}
 */
export function buildRouteIncidents(route, opts = {}) {
  const {
    congestionSegments = [],
    congestionAvailable = false,
    reports = [],
    showFixed = true,
    adminMode = false,
    external = { available: false, items: [] },
    hazardThresholdMeters = 120,
    externalThresholdMeters = 500,
    maxHazards = 10,
  } = opts;

  const incidents = [];
  const availableSources = [];
  const routeCoords = route?.geometry?.coordinates;

  // 1. Congestion (real Mapbox annotations, when fetched)
  if (congestionAvailable) {
    availableSources.push("mapbox-congestion");
    incidents.push(...congestionRunsToIncidents(congestionSegments));
  }

  // 2. Active user-reported hazards near the route
  if (Array.isArray(reports) && Array.isArray(routeCoords) && routeCoords.length >= 2) {
    availableSources.push("user-reports");
    const near = [];
    for (const rep of reports) {
      if (!isValidCoord(rep?.coord)) continue;
      if (rep.hiddenGlobally || rep.status === "rejected" || rep.status === "fixed") continue;
      if (rep.hiddenForUser && !adminMode) continue;
      if (rep.status === "fixed" && !showFixed) continue;
      const d = pointLineDistMeters(rep.coord, routeCoords);
      if (isFinite(d) && d <= hazardThresholdMeters) near.push({ rep, d });
    }
    near.sort((a, b) => a.d - b.d);
    for (const { rep, d } of near.slice(0, maxHazards)) {
      incidents.push({
        id: `haz-${rep.id}`,
        type: INCIDENT_TYPES.HAZARD,
        severity: REPORT_SEVERITY[rep.severity] || "medium",
        coord: rep.coord,
        distanceFromRouteMeters: Math.round(d),
        description: rep.description ? `Reported hazard: ${rep.description}` : "User-reported pothole",
        source: "user-report",
        createdAt: rep.captureAt || rep.createdAt || null,
      });
    }
  }

  // 3. External feed (accidents, closures, construction, lane restrictions…)
  if (external?.available && Array.isArray(external.items) && Array.isArray(routeCoords) && routeCoords.length >= 2) {
    availableSources.push("external-feed");
    for (const item of external.items) {
      if (!isValidCoord(item?.coord)) continue;
      const d = pointLineDistMeters(item.coord, routeCoords);
      if (!isFinite(d) || d > externalThresholdMeters) continue;
      incidents.push({
        id: item.id,
        type: item.type,
        severity: item.severity,
        coord: item.coord,
        distanceFromRouteMeters: Math.round(d),
        description: item.description,
        source: "external-feed",
        startedAt: item.startedAt ?? null,
      });
    }
  }

  incidents.sort((a, b) => a.distanceFromRouteMeters - b.distanceFromRouteMeters);
  return { incidents, availableSources };
}

function parseExternalFeature(feature, i) {
  try {
    const geom = feature?.geometry;
    const coord = geom?.type === "Point" ? geom.coordinates : geom?.coordinates?.[0];
    if (!isValidCoord(coord)) return null;
    const props = feature?.properties || {};
    const type = normalizeIncidentType(props.type || props.incident_type || props.category || props.title);
    const severity = normalizeSeverity(props.severity, type === INCIDENT_TYPES.ACCIDENT ? "high" : "medium");
    const description =
      props.description || props.title || props.headline || INCIDENT_TYPE_LABELS[type];
    return {
      id: props.id != null ? `ext-${props.id}` : `ext-${i}`,
      type,
      severity,
      coord: [Number(coord[0]), Number(coord[1])],
      description: String(description),
      startedAt: props.started_at || props.time || null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the optional external incident feed (GeoJSON FeatureCollection or a
 * bare Feature array). Never throws; failures return available:false.
 *
 * @param {string|null|undefined} url
 * @returns {Promise<{available:boolean, items:Array, error:string|null}>}
 */
export async function fetchExternalIncidents(url) {
  if (!url) return { available: false, items: [], error: null };
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Incident feed ${res.status}`);
    const json = await res.json();
    const features = Array.isArray(json) ? json : Array.isArray(json?.features) ? json.features : [];
    const items = features.map(parseExternalFeature).filter(Boolean);
    return { available: true, items, error: null };
  } catch (e) {
    return { available: false, items: [], error: e?.message || "Incident feed unavailable" };
  }
}
