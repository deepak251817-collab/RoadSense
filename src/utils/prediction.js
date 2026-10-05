/**
 * STARS predictive road-risk engine.
 *
 * Deterministic, rule-based ESTIMATION of future road risk at +15 / +30 /
 * +60 minutes. This is NOT a trained ML model and must always be presented
 * to users as a "Predictive estimate" — never as AI, never as a forecast
 * guarantee.
 *
 * Inputs are the data the app actually has: current safety factors, an
 * optional weather forecast, available historical risk and the target
 * horizon. Missing inputs are excluded (never guessed), and the returned
 * confidence communicates how much evidence backs the estimate.
 */
import {
  calculateRoadSafetyScore,
  calculateTimeRisk,
  clampScore,
  CONFIDENCE_BANDS,
} from "./safetyScore";

/** Supported prediction horizons, in minutes. */
export const PREDICTION_HORIZONS = [15, 30, 60];

/** Display metadata for the prediction label shown in the UI. */
export const PREDICTION_LABEL = "Predictive estimate";

/**
 * Risk multiplier applied to a forecast weather main-condition label.
 * Returns null when the forecast carries no usable weather information.
 */
const FORECAST_WEATHER_RISK = {
  thunderstorm: 90,
  tornado: 100,
  snow: 80,
  rain: 60,
  drizzle: 45,
  fog: 60,
  mist: 55,
  haze: 50,
  clouds: 25,
  clear: 8,
};

/**
 * Map forecast OpenWeather data to a 0..100 risk value, or null when absent.
 * @param {Object|null} forecast OpenWeather forecast entry (or {main: "..."} )
 * @returns {number|null}
 */
export function forecastWeatherRisk(forecast) {
  if (!forecast || typeof forecast !== "object") return null;
  const main = String(forecast.weather?.[0]?.main || forecast.main || "").toLowerCase();
  if (!main) return null;
  let risk = FORECAST_WEATHER_RISK[main];
  if (risk == null) risk = 30;
  const desc = String(forecast.weather?.[0]?.description || "").toLowerCase();
  if (main === "rain" && (desc.includes("heavy") || desc.includes("extreme"))) risk = 80;
  if (main === "thunderstorm" && (desc.includes("heavy") || desc.includes("extreme"))) risk = 95;
  return risk;
}

/**
 * Estimate a future risk profile from current conditions.
 *
 * @param {Object} input
 * @param {Object} [input.currentConditions] output of calculateRoadSafetyScore
 *   (or any {factors:{...}} record with 0..100 factor risks)
 * @param {Object} [input.forecast] weather forecast for the target time
 * @param {number|null} [input.historicalRisk] 0..100 typical risk at this
 *   location/time from stored history (null when no history exists)
 * @param {number} [input.timeAhead] minutes ahead: 15 | 30 | 60
 * @param {Date} [input.now] base time (injectable for deterministic tests)
 * @returns {{predictedScore:number, riskLevel:Object, confidence:Object,
 *   factors:Object, label:string, horizonMinutes:number}}
 */
export function predictRoadRisk({
  currentConditions = null,
  forecast = null,
  historicalRisk = null,
  timeAhead = 15,
  now = new Date(),
} = {}) {
  const horizon = PREDICTION_HORIZONS.includes(Number(timeAhead))
    ? Number(timeAhead)
    : PREDICTION_HORIZONS[0];

  // --- Gather the factors we actually have -------------------------------
  const baseFactors = {};
  if (currentConditions?.factors) {
    for (const [key, f] of Object.entries(currentConditions.factors)) {
      if (f && f.available && Number.isFinite(f.risk)) baseFactors[key] = f.risk;
    }
  }

  const evidence = {
    current: Object.keys(baseFactors).length > 0,
    forecast: false,
    historical: Number.isFinite(historicalRisk),
    time: false,
  };

  // --- 1. Time shifts toward the risk profile at the target hour ---------
  const targetTime = new Date(now.getTime() + horizon * 60 * 1000);
  const futureTimeRisk = calculateTimeRisk(targetTime);
  const currentTimeRisk = Number.isFinite(baseFactors.time) ? baseFactors.time : null;
  // Weight grows with horizon: 15 min ≈ 35%, 60 min ≈ 70% toward future hour.
  const timeShiftWeight = horizon <= 15 ? 0.35 : horizon <= 30 ? 0.5 : 0.7;
  if (currentTimeRisk != null) {
    baseFactors.time = Math.round(
      currentTimeRisk * (1 - timeShiftWeight) + futureTimeRisk * timeShiftWeight
    );
    evidence.time = true;
  } else {
    baseFactors.time = futureTimeRisk;
    evidence.time = true;
  }

  // --- 2. Forecast weather pulls the weather factor toward forecast -------
  const fcRisk = forecastWeatherRisk(forecast);
  if (fcRisk != null) {
    const currentWeather = Number.isFinite(baseFactors.weather) ? baseFactors.weather : null;
    const blend = horizon >= 30 ? 0.8 : horizon >= 15 ? 0.6 : 0.4;
    baseFactors.weather =
      currentWeather != null
        ? Math.round(currentWeather * (1 - blend) + fcRisk * blend)
        : fcRisk;
    evidence.forecast = true;
  }

  // --- 3. Historical risk (when stored) nudges unstable factors ----------
  // Applies only to hazard-prone factors and only as a mild prior.
  if (evidence.historical) {
    const h = clampScore(historicalRisk);
    for (const key of ["pothole", "roadCondition", "incident"]) {
      if (Number.isFinite(baseFactors[key])) {
        baseFactors[key] = Math.round(baseFactors[key] * 0.75 + h * 0.25);
      }
    }
  }

  // --- Score the shifted profile through the central engine ---------------
  const result = calculateRoadSafetyScore(
    {
      traffic: baseFactors.traffic ?? null,
      weather: baseFactors.weather ?? null,
      potholes: baseFactors.pothole ?? null,
      incidents: baseFactors.incident ?? null,
      accidents: baseFactors.accident ?? null,
      roadCondition: baseFactors.roadCondition ?? null,
      timeRisk: baseFactors.time ?? null,
    }
  );

  // --- Confidence: prediction confidence is capped by evidence -----------
  const evidenceCount = Object.values(evidence).filter(Boolean).length;
  const coverage = evidenceCount / Object.keys(evidence).length; // 0..1
  const baseConf = result.confidence.score;
  const combined = Math.round(baseConf * 0.7 + coverage * 100 * 0.3);
  let band = CONFIDENCE_BANDS[3];
  if (evidenceCount > 0) {
    if (combined >= 80 && evidence.forecast) band = CONFIDENCE_BANDS[0];
    else if (combined >= 50) band = CONFIDENCE_BANDS[1];
    else band = CONFIDENCE_BANDS[2];
  }

  const factors = {};
  for (const [key, f] of Object.entries(result.factors)) {
    factors[key] = {
      label: f.label,
      risk: f.risk,
      available: f.available,
      changed: f.available && currentTimeRisk != null && key === "time" && f.risk !== currentTimeRisk,
    };
  }

  const reasons = [];
  if (evidence.forecast) reasons.push("✓ Weather forecast applied");
  if (evidence.historical) reasons.push("✓ Historical risk prior applied");
  reasons.push(`${evidence.time ? "✓" : "⚠"} Time-of-day shift (${horizon} min ahead)`);
  if (!evidence.forecast) reasons.push("⚠ No weather forecast available");
  if (!evidence.historical) reasons.push("⚠ No historical data for this location");

  return {
    predictedScore: result.score,
    riskLevel: result.classification,
    confidence: {
      ...band,
      score: combined,
      reasons,
      evidence,
    },
    factors,
    label: PREDICTION_LABEL,
    horizonMinutes: horizon,
  };
}

/**
 * Convenience helper: predictions for all supported horizons at once.
 *
 * @param {Object} input same shape as predictRoadRisk minus timeAhead
 * @returns {Array<{horizonMinutes:number, predictedScore:number, riskLevel:Object, confidence:Object, factors:Object, label:string}>}
 */
export function predictRoadRiskAllHorizons(input = {}) {
  return PREDICTION_HORIZONS.map((h) => predictRoadRisk({ ...input, timeAhead: h }));
}
