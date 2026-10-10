/**
 * Multi-route analysis.
 *
 * Produces one deterministic analysis record per available route:
 * distance, travel time, traffic condition, pothole exposure, weather risk,
 * incident count and an overall safety score. It only consumes data that
 * actually exists — unavailable inputs are reported as unavailable rather
 * than guessed.
 */
import {
  calculateTrafficRisk,
  calculatePotholeRisk,
  calculateRoadConditionRisk,
  calculateWeatherRisk,
  calculateIncidentRisk,
  calculateAccidentRisk,
  calculateTimeRisk,
  calculateRouteSafetyScore,
  classifySafetyScore,
  classifyTimeRisk,
  assessFactorConfidence,
} from "../safety/safetyScore";
import { isPotholeType } from "../safety/hazardTypes";
import { pointLineDistMeters, isValidCoord } from "./geo";

/** Human label for a 0..100 risk value (null → unavailable). */
function labelForRisk(risk) {
  if (risk == null || !Number.isFinite(risk)) return "—";
  if (risk < 30) return "Low";
  if (risk < 60) return "Medium";
  if (risk < 80) return "High";
  return "Severe";
}

/**
 * Collect reports near a route applying the same visibility rules as the map.
 * @returns {{items:Array, count:number, highCount:number, fixedCount:number}}
 */
export function collectRouteReports(route, reports, { showFixed, adminMode } = {}, thresholdMeters = 120) {
  const empty = { items: [], count: 0, highCount: 0, fixedCount: 0, activePotholeCount: 0, activePotholeHigh: 0, activeConditionCount: 0, activeConditionHigh: 0, activeWaterloggingCount: 0 };
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(reports)) return empty;
  const items = [];
  let highCount = 0;
  let fixedCount = 0;
  let activeCount = 0;
  let activeHighCount = 0;
  const pothole = { count: 0, high: 0 };
  const condition = { count: 0, high: 0 };
  let waterlogging = 0;
  for (const rep of reports) {
    if (!isValidCoord(rep?.coord)) continue;
    if (rep.hiddenGlobally) continue;
    if (rep.status === "rejected") continue;
    if (rep.hiddenForUser && !adminMode) continue;
    if (rep.status === "fixed" && !showFixed) continue;
    const d = pointLineDistMeters(rep.coord, coords);
    if (isFinite(d) && d <= thresholdMeters) {
      items.push(rep);
      if (rep.severity === "high") highCount += 1;
      if (rep.status === "fixed") {
        fixedCount += 1;
      } else {
        // Fixed hazards no longer count against route safety scoring
        activeCount += 1;
        if (rep.severity === "high") activeHighCount += 1;
        if (rep.type === "waterlogging") waterlogging += 1;
        // Pothole surface reports score as pothole risk; every other
        // condition type (broken road, debris, closures, …) scores as
        // road-condition risk.
        const bucket = isPotholeType(rep.type) ? pothole : condition;
        bucket.count += 1;
        if (rep.severity === "high") bucket.high += 1;
      }
    }
  }
  return {
    items, count: items.length, highCount, fixedCount, activeCount, activeHighCount,
    activePotholeCount: pothole.count, activePotholeHigh: pothole.high,
    activeConditionCount: condition.count, activeConditionHigh: condition.high,
    activeWaterloggingCount: waterlogging,
  };
}

/**
 * Estimate traffic risk from route step speeds when no live traffic fetch
 * exists yet. Derived from the durations/distances Mapbox returned for the
 * route — clearly flagged as an estimate by the caller.
 * @returns {{risk:number|null, estimated:boolean}}
 */
function estimateTrafficFromRoute(route) {
  const steps = Array.isArray(route?.legs) ? route.legs.flatMap((l) => l?.steps || []) : [];
  if (!steps.length) return { risk: null, estimated: false };
  let weighted = 0;
  let totalDist = 0;
  for (const step of steps) {
    const d = step?.distance || 0;
    const t = step?.duration || 0;
    if (d <= 0 || t <= 0) continue;
    const speedKmh = (d / t) * 3.6;
    // Congestion vs a 65 km/h reference free-flow speed (0 = free, 100 = stopped)
    let congestion = Math.max(0, Math.min(100, 100 - (speedKmh / 65) * 100));
    if (!isFinite(congestion)) congestion = 0;
    weighted += congestion * d;
    totalDist += d;
  }
  if (totalDist <= 0) return { risk: null, estimated: false };
  return { risk: Math.round(weighted / totalDist), estimated: true };
}

/** Traffic risk from a stored live-traffic entry, if present. */
function trafficFromLiveData(live) {
  const pts = Array.isArray(live?.points) ? live.points : [];
  if (!pts.length) return null;
  const delays = pts.map((p) => p?.delayPct).filter((v) => Number.isFinite(v));
  if (!delays.length) return null;
  const avgDelayPct = delays.reduce((a, b) => a + b, 0) / delays.length;
  return calculateTrafficRisk({ avgDelayPct });
}

/**
 * Analyze a single route against all available context data.
 * @param {Object} route Mapbox route object
 * @param {number} index route index
 * @param {Object} ctx analysis context
 * @param {Array}  ctx.reports user pothole reports
 * @param {boolean} ctx.showFixed admin filter
 * @param {boolean} ctx.adminMode admin filter
 * @param {Object} ctx.trafficByRoute live traffic entries keyed by route index
 * @param {Object} ctx.routeWeather weather entries keyed by route index
 * @param {Array|null} ctx.incidentsByRoute incidents for route index (null = source unavailable)
 * @param {Date} [ctx.now] fixed timestamp for deterministic time risk
 */
export function analyzeRoute(route, index, ctx = {}) {
  const {
    reports = [],
    showFixed = true,
    adminMode = false,
    trafficByRoute = {},
    routeWeather = {},
    incidentsByRoute = null,
    now = new Date(),
  } = ctx;

  const distanceMeters = Number(route?.distance) || 0;
  const durationSeconds = Number(route?.duration) || 0;

  // Traffic: live data preferred, else step-speed estimate
  const liveTraffic = trafficByRoute?.[index];
  const liveRisk = trafficFromLiveData(liveTraffic);
  const traffic =
    liveRisk != null
      ? { risk: liveRisk, estimated: false, available: true }
      : (() => {
          const est = estimateTrafficFromRoute(route);
          return { risk: est.risk, estimated: est.estimated, available: est.risk != null };
        })();

  // Potholes: reports near this route (same visibility rules as the map)
  const near = collectRouteReports(route, reports, { showFixed, adminMode });

  // Weather: only when fetched for this route
  const weatherEntry = routeWeather?.[index];
  const weatherRisk = calculateWeatherRisk(weatherEntry?.points);
  const weather = { risk: weatherRisk, available: weatherRisk != null, label: labelForRisk(weatherRisk) };

  // Incidents: only when an incident source has been wired in for this route.
  // Accident risk is only "available" when an accident-capable source exists
  // (e.g. an external incident feed) — otherwise it stays excluded.
  const incidentsAvailable = Array.isArray(incidentsByRoute);
  const accidentsAvailable = ctx.accidentsAvailable ?? incidentsAvailable;
  const incidentList = incidentsAvailable ? incidentsByRoute : [];
  const incidentRisk = calculateIncidentRisk(incidentList, { available: incidentsAvailable });
  const accidentRisk = calculateAccidentRisk(incidentList, { available: accidentsAvailable });

  const timeRisk = calculateTimeRisk(now);

  const { score, factorRisks, missingFactors } = calculateRouteSafetyScore({
    traffic: traffic.available ? traffic.risk : null,
    pothole: calculatePotholeRisk({
      // Only hazards that still affect the road influence scoring; fixed ones
      // are excluded here even when they remain visible for reference.
      count: near.activePotholeCount,
      highSeverityCount: near.activePotholeHigh,
      distanceMeters: distanceMeters > 0 ? distanceMeters : null,
    }),
    roadCondition: calculateRoadConditionRisk({
      count: near.activeConditionCount,
      highSeverityCount: near.activeConditionHigh,
      distanceMeters: distanceMeters > 0 ? distanceMeters : null,
    }),
    weather: weatherRisk,
    incident: incidentRisk,
    accident: accidentRisk,
    time: timeRisk,
  });

  // Evidence coverage for this analysis: which factors actually had data.
  // A step-speed traffic estimate caps confidence at Medium (same rule as
  // the centralized engine).
  const confidence = assessFactorConfidence(factorRisks, {
    estimatedKeys: traffic.estimated ? ["traffic"] : [],
  });

  return {
    index,
    label: `Route ${index + 1}`,
    distanceMeters,
    durationSeconds,
    distanceKm: distanceMeters / 1000,
    durationMinutes: Math.round(durationSeconds / 60),
    traffic: {
      risk: traffic.risk,
      available: traffic.available,
      estimated: traffic.estimated,
      label: labelForRisk(traffic.risk),
    },
    potholes: { count: near.count, highCount: near.highCount, fixedCount: near.fixedCount },
    waterlogging: { count: near.activeWaterloggingCount },
    weather,
    incidents: {
      available: incidentsAvailable,
      count: incidentList.length,
      label: incidentsAvailable ? String(incidentList.length) : "—",
    },
    time: {
      risk: timeRisk,
      available: true,
      label: classifyTimeRisk(timeRisk).label,
      color: classifyTimeRisk(timeRisk).color,
    },
    score,
    classification: classifySafetyScore(score),
    factorRisks,
    missingFactors,
    confidence,
  };
}

/** Analyze every route in a route list. */
export function analyzeRoutes(routes, ctx = {}) {
  if (!Array.isArray(routes)) return [];
  return routes.map((r, i) => analyzeRoute(r, i, ctx));
}
