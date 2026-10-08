/**
 * Flood / waterlogging risk estimation.
 *
 * Deterministic, rule-based estimate of waterlogging exposure along a route
 * built ONLY from evidence the app actually has:
 *   - rainfall measured by the OpenWeather sample points along the route
 *   - rainfall expected in the nearest OpenWeather forecast entries
 *   - active user-reported waterlogging hazards near the route
 *
 * This is NOT a flood model, NOT a drainage simulation and NOT live
 * inundation data. Results must always be presented with the
 * WATERLOGGING_LABEL ("Predictive estimate") label. Missing inputs are
 * excluded (never guessed); the confidence level communicates how much
 * evidence backs the estimate. Zero known reports = zero known risk from
 * that factor — but absent rainfall data is "unknown", not "dry".
 */
import { isWaterloggingType } from "../safety/hazardTypes";
import { pointLineDistMeters, isValidCoord } from "../routing/geo";
import { CONFIDENCE_BANDS } from "../safety/safetyScore";

/** Display label that must accompany every waterlogging number in the UI. */
export const WATERLOGGING_LABEL = "Predictive estimate";

/** Relative weight of each evidence factor (renormalized over available ones). */
export const WATERLOGGING_WEIGHTS = {
  rainfall: 0.45, // measured rainfall along the route
  reports: 0.35, // active user waterlogging reports near the route
  forecast: 0.20, // rain expected in the near forecast window
};

/** How far from the route (meters) a waterlogging report still counts. */
export const WATERLOGGING_THRESHOLD_METERS = 150;

/**
 * Risk bands for a 0..100 waterlogging risk (higher = worse).
 * Colors match the segment-risk palette.
 */
export const WATERLOGGING_BANDS = [
  { key: "severe", label: "Severe", min: 80, color: "#ef4444" },
  { key: "high", label: "High", min: 60, color: "#f97316" },
  { key: "moderate", label: "Moderate", min: 30, color: "#eab308" },
  { key: "low", label: "Low", min: 0, color: "#22c55e" },
];

const round = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Classify a 0..100 waterlogging risk into a labeled band. */
export function classifyWaterloggingRisk(risk) {
  if (!Number.isFinite(risk)) {
    return { key: "unknown", label: "Unknown", min: 0, color: "#9ca3af" };
  }
  const r = clampRisk(risk);
  return WATERLOGGING_BANDS.find((b) => r >= b.min) || WATERLOGGING_BANDS[WATERLOGGING_BANDS.length - 1];
}

const clampRisk = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/**
 * Rainfall volume (mm) reported by an OpenWeather sample point or forecast
 * entry. Prefers the 1-hour window (freshest), falls back to the 3-hour one.
 * Returns null when the payload carries no rain measurement at all.
 *
 * @param {Object|null} payload OpenWeather point/entry (`{rain:{...}}`)
 * @returns {number|null}
 */
export function rainfallMm(payload) {
  const rain = payload?.rain;
  if (!rain || typeof rain !== "object") return null;
  const one = Number(rain["1h"]);
  if (Number.isFinite(one)) return one;
  const three = Number(rain["3h"]);
  if (Number.isFinite(three)) return three;
  return null;
}

/**
 * Map a rainfall volume to a 0..100 waterlogging-favoring risk.
 * Thresholds are coarse bucketing against the reported window (1h or 3h)
 * — an approximation, documented as such, not a hydrological model.
 *
 * @param {number|null} mm rainfall volume in millimeters
 * @returns {number|null} null when mm is not a usable measurement
 */
export function rainfallRiskFromMm(mm) {
  if (!Number.isFinite(mm) || mm < 0) return null;
  if (mm === 0) return 0;
  if (mm <= 2.5) return 35; // light
  if (mm <= 10) return 60; // moderate
  if (mm <= 30) return 85; // heavy
  return 100; // extreme / cloudburst-level
}

/**
 * Collect active waterlogging reports near a route (same visibility rules
 * as the map; fixed reports are always excluded from risk — they no longer
 * waterlog anything).
 *
 * @param {Object} route Mapbox route
 * @param {Array} reports all user reports
 * @param {Object} [opts] {showFixed, adminMode} (kept for call-shape parity)
 * @param {number} [thresholdMeters]
 * @returns {{items:Array, count:number, highCount:number}}
 */
export function collectWaterloggingReports(route, reports, _opts = {}, thresholdMeters = WATERLOGGING_THRESHOLD_METERS) {
  const empty = { items: [], count: 0, highCount: 0 };
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(reports)) return empty;
  const items = [];
  let highCount = 0;
  for (const rep of reports) {
    if (!rep || !isWaterloggingType(rep.type)) continue;
    if (!isValidCoord(rep.coord)) continue;
    if (rep.hiddenGlobally) continue;
    if (rep.status === "rejected") continue;
    if (rep.status === "fixed") continue;
    if (rep.hiddenForUser) continue;
    const d = pointLineDistMeters(rep.coord, coords);
    if (isFinite(d) && d <= thresholdMeters) {
      items.push(rep);
      if (rep.severity === "high") highCount += 1;
    }
  }
  return { items, count: items.length, highCount };
}

/** 0..100 risk from active waterlogging reports near the route. */
export function waterloggingReportRisk({ count = 0, highCount = 0, distanceMeters = null } = {}) {
  const total = Math.max(0, count || 0);
  if (total === 0) return 0;
  const high = Math.max(0, Math.min(highCount || 0, total));
  const distanceKm = Number.isFinite(distanceMeters) && distanceMeters > 0 ? distanceMeters / 1000 : null;
  const perKm = distanceKm ? total / distanceKm : total;
  const density = Math.min(60, perKm * 30);
  const severity = high * 12 + (total - high) * 5;
  return round(density + severity);
}

/**
 * Estimate waterlogging / flood exposure for a route.
 *
 * @param {Object} input
 * @param {Object} input.route Mapbox route geometry
 * @param {Array}  [input.reports] all user reports
 * @param {Array}  [input.weatherPoints] OpenWeather points already fetched
 *   for this route (`{label, coord, data}`); empty when never fetched
 * @param {Object|null} [input.forecast] nearest OpenWeather forecast entry
 * @param {boolean} [input.showFixed] map fixed-report visibility
 * @param {boolean} [input.adminMode] admin visibility
 * @returns {{risk:number|null, level:Object, label:string, factors:Object,
 *   confidence:Object, evidence:Object, reasons:string[]}}
 */
export function assessWaterloggingRisk({
  route = null,
  reports = [],
  weatherPoints = [],
  forecast = null,
  showFixed = true,
  adminMode = false,
} = {}) {
  const distanceMeters = Number(route?.distance) || null;

  // --- Factor 1: measured rainfall along the route -----------------------
  // Worst sample along the route (flooding is localized: one submerged
  // underpass matters more than the average). A fetched point WITHOUT a
  // `rain` field is real evidence of no measured rain (risk 0), not
  // missing data.
  let rainfallRisk = null;
  let rainfallMmValue = null;
  let rainfallPointCount = 0;
  if (Array.isArray(weatherPoints) && weatherPoints.length) {
    const values = weatherPoints
      .map((p) => rainfallMm(p?.data ?? p))
      .filter((v) => v != null);
    rainfallPointCount = weatherPoints.length;
    if (values.length) {
      rainfallMmValue = Math.max(...values);
      rainfallRisk = rainfallRiskFromMm(rainfallMmValue);
    } else {
      // Points fetched, but none carry a rain measurement — treat as no
      // measured rain only when the payloads are usable weather objects.
      const anyPayload = weatherPoints.some((p) => p?.data?.weather || p?.weather);
      rainfallRisk = anyPayload ? 0 : null;
    }
  }

  // --- Factor 2: active waterlogging reports near the route --------------
  const near = collectWaterloggingReports(route, reports, { showFixed, adminMode });
  const reportsRisk = waterloggingReportRisk({
    count: near.count,
    highCount: near.highCount,
    distanceMeters,
  });

  // --- Factor 3: forecast rain in the near window -------------------------
  // Highest 3-hour volume among the next two forecast steps (~6 hours).
  let forecastRisk = null;
  let forecastMmValue = null;
  if (forecast && typeof forecast === "object") {
    const mm = rainfallMm(forecast);
    if (mm != null) {
      forecastMmValue = mm;
      forecastRisk = rainfallRiskFromMm(mm);
    } else {
      const main = String(forecast.weather?.[0]?.main || forecast.main || "").toLowerCase();
      // No volume, but an explicit rain/thunderstorm condition is still evidence.
      if (main === "rain" || main === "thunderstorm" || main === "drizzle") forecastRisk = 60;
    }
  }

  const factors = {
    rainfall: {
      key: "rainfall",
      label: "Rainfall along route",
      risk: rainfallRisk,
      available: rainfallRisk != null,
      mm: rainfallMmValue,
      points: rainfallPointCount,
    },
    reports: {
      key: "reports",
      label: "Waterlogging reports",
      risk: reportsRisk,
      available: true,
      count: near.count,
      highCount: near.highCount,
    },
    forecast: {
      key: "forecast",
      label: "Forecast rain (next hours)",
      risk: forecastRisk,
      available: forecastRisk != null,
      mm: forecastMmValue,
    },
  };

  // --- Combine available factors (weights renormalized) -------------------
  let weighted = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(WATERLOGGING_WEIGHTS)) {
    const f = factors[key];
    if (!f.available) continue;
    weighted += weight * clampRisk(f.risk);
    weightTotal += weight;
  }
  const risk = weightTotal > 0 ? round(weighted / weightTotal) : null;

  // --- Confidence from evidence coverage ---------------------------------
  const evidence = {
    rainfall: factors.rainfall.available,
    reports: factors.reports.available,
    forecast: factors.forecast.available,
  };
  const evidenceCount = Object.values(evidence).filter(Boolean).length;
  let band = CONFIDENCE_BANDS[3]; // insufficient
  if (evidenceCount === 3) band = CONFIDENCE_BANDS[0]; // high
  else if (evidenceCount === 2) band = CONFIDENCE_BANDS[1]; // medium
  else if (evidenceCount === 1) band = CONFIDENCE_BANDS[2]; // low

  const reasons = [];
  if (evidence.rainfall) {
    reasons.push(
      rainfallMmValue != null
        ? `✓ Rainfall measured along route (max ${rainfallMmValue} mm at ${rainfallPointCount} sample point${rainfallPointCount === 1 ? "" : "s"})`
        : `✓ Route weather checked — no measured rain (${rainfallPointCount} sample point${rainfallPointCount === 1 ? "" : "s"})`
    );
  } else {
    reasons.push("⚠ No rainfall data for this route — open the Weather layer to measure it");
  }
  if (near.count > 0) {
    reasons.push(`✓ ${near.count} active waterlogging report${near.count === 1 ? "" : "s"} within ${WATERLOGGING_THRESHOLD_METERS} m of the route${near.highCount ? ` (${near.highCount} high severity)` : ""}`);
  } else {
    reasons.push("✓ No active waterlogging reports near the route");
  }
  if (evidence.forecast) {
    reasons.push(
      forecastMmValue != null
        ? `✓ Forecast rain expected (${forecastMmValue} mm in the next window)`
        : "✓ Forecast shows rain conditions"
    );
  } else {
    reasons.push("⚠ No weather forecast available");
  }

  return {
    risk,
    level: classifyWaterloggingRisk(risk),
    label: WATERLOGGING_LABEL,
    factors,
    confidence: {
      level: band.key,
      label: band.label,
      color: band.color,
      score: Math.round((evidenceCount / Object.keys(evidence).length) * 100),
      availableEvidence: evidenceCount,
      totalEvidence: Object.keys(evidence).length,
      reasons,
    },
    evidence,
    reasons,
  };
}
