/**
 * STARS safety scoring engine.
 *
 * Deterministic, dependency-free road-safety risk scoring for routes.
 * Every factor returns a risk value in the range 0..100 (higher = more risk),
 * or `null` when the underlying data is genuinely unavailable — unknown data is
 * never treated as "safe" and never fabricated as "risky": it is excluded from
 * the weighted score instead.
 */

/** Configurable factor weights (need not sum to 1; they are normalized). */
export const DEFAULT_WEIGHTS = {
  traffic: 0.22,
  pothole: 0.26,
  weather: 0.16,
  incident: 0.12,
  accident: 0.14,
  time: 0.10,
  roadCondition: 0.14,
};

/** Safety classification bands (inclusive ranges). */
const SAFETY_BANDS = [
  { min: 90, max: 100, key: "very-safe", label: "Very Safe", color: "#15803d" },
  { min: 75, max: 89, key: "safe", label: "Safe", color: "#16a34a" },
  { min: 60, max: 74, key: "moderate", label: "Moderate", color: "#d97706" },
  { min: 40, max: 59, key: "risky", label: "Risky", color: "#ea580c" },
  { min: 0, max: 39, key: "high-risk", label: "High Risk", color: "#dc2626" },
];

/** Clamp any numeric value into the 0..100 score range. */
export const clampScore = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const round = (v) => Math.round(clampScore(v));

/** Risk value contributed by a single congestion level label. */
const CONGESTION_LEVEL_RISK = {
  low: 20,
  moderate: 50,
  heavy: 78,
  severe: 95,
  unknown: 40,
};

/**
 * Traffic risk from real Mapbox traffic data.
 * @param {Object} input
 * @param {number|null} [input.avgDelayPct] average delay % (live vs free-flow)
 * @param {string[]|null} [input.congestionLevels] congestion annotation labels
 * @returns {number|null} 0..100 risk, or null when no traffic data exists
 */
export function calculateTrafficRisk({ avgDelayPct = null, congestionLevels = null } = {}) {
  if (Array.isArray(congestionLevels) && congestionLevels.length) {
    const values = congestionLevels.map((l) => CONGESTION_LEVEL_RISK[String(l).toLowerCase()] ?? CONGESTION_LEVEL_RISK.unknown);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return round(avg);
  }
  if (Number.isFinite(avgDelayPct)) {
    // 0% delay ≈ 10 risk, 100% delay ≈ 100 risk; free-flowing traffic stays low.
    return round(10 + Math.max(0, avgDelayPct) * 0.9);
  }
  return null;
}

/**
 * Pothole / road-surface risk from reports near a route.
 * @param {Object} input
 * @param {number} [input.count] total reports near the route
 * @param {number} [input.highSeverityCount] high-severity reports near the route
 * @param {number|null} [input.distanceMeters] route length for density calculation
 * @returns {number} 0..100 risk (0 when there are genuinely no reports)
 */
export function calculatePotholeRisk({ count = 0, highSeverityCount = 0, distanceMeters = null } = {}) {
  const total = Math.max(0, count || 0);
  const high = Math.max(0, Math.min(highSeverityCount || 0, total));
  if (total === 0) return 0;
  const distanceKm = Number.isFinite(distanceMeters) && distanceMeters > 0 ? distanceMeters / 1000 : null;
  const perKm = distanceKm ? total / distanceKm : total; // without a length, treat count as-is
  const densityRisk = perKm * 30;
  const severityRisk = high * 12 + (total - high) * 4;
  return round(densityRisk + severityRisk);
}

const WEATHER_MAIN_RISK = {
  thunderstorm: 90,
  tornado: 100,
  squall: 92,
  snow: 80,
  rain: 60,
  drizzle: 55,
  fog: 65,
  mist: 62,
  haze: 60,
  smoke: 68,
  dust: 70,
  sand: 70,
  ash: 72,
  clouds: 25,
  clear: 8,
};

/**
 * Weather risk from OpenWeather sample points along a route.
 * @param {Array<{data?: Object}>|Array<Object>} weatherPoints routeWeather points
 * @returns {number|null} 0..100 risk, or null when no weather data exists
 */
export function calculateWeatherRisk(weatherPoints) {
  if (!Array.isArray(weatherPoints) || !weatherPoints.length) return null;
  const values = weatherPoints
    .map((p) => {
      const w = p?.data ?? p;
      const main = String(w?.weather?.[0]?.main || "").toLowerCase();
      const desc = String(w?.weather?.[0]?.description || "").toLowerCase();
      if (!main) return null;
      let risk = WEATHER_MAIN_RISK[main] ?? 30;
      if (main === "rain" && (desc.includes("heavy") || desc.includes("extreme"))) risk = 80;
      if (main === "thunderstorm" && (desc.includes("heavy") || desc.includes("extreme"))) risk = 95;
      return risk;
    })
    .filter((v) => v != null);
  if (!values.length) return null;
  return round(values.reduce((a, b) => a + b, 0) / values.length);
}

const SEVERITY_RISK = { low: 25, medium: 50, high: 75, critical: 95 };

/**
 * Road-condition risk from non-pothole condition reports near a route
 * (broken road, waterlogging, debris, closures, construction, …).
 * Same evidence convention as pothole risk: zero reports = zero known risk.
 *
 * @param {Object} input
 * @param {number} [input.count] condition reports near the route
 * @param {number} [input.highSeverityCount] high-severity condition reports
 * @param {number|null} [input.distanceMeters] route length for density
 * @returns {number} 0..100 risk
 */
export function calculateRoadConditionRisk({ count = 0, highSeverityCount = 0, distanceMeters = null } = {}) {
  const total = Math.max(0, count || 0);
  const high = Math.max(0, Math.min(highSeverityCount || 0, total));
  if (total === 0) return 0;
  const distanceKm = Number.isFinite(distanceMeters) && distanceMeters > 0 ? distanceMeters / 1000 : null;
  const perKm = distanceKm ? total / distanceKm : total;
  const densityRisk = perKm * 26;
  const severityRisk = high * 10 + (total - high) * 4;
  return round(densityRisk + severityRisk);
}

const normalizeIncidents = (incidents) =>
  (Array.isArray(incidents) ? incidents : []).filter((i) => i && typeof i === "object");

/**
 * Risk from road incidents (hazards, closures, construction, ...).
 * @param {Array<Object>} incidents incidents already filtered/near the route
 * @param {Object} [opts]
 * @param {boolean} [opts.available] false when no incident source exists at all
 * @returns {number|null} 0..100 risk, or null when incident data is unavailable
 */
export function calculateIncidentRisk(incidents, { available = true } = {}) {
  if (!available) return null;
  const list = normalizeIncidents(incidents);
  if (!list.length) return 0;
  const values = list.map((i) => SEVERITY_RISK[String(i.severity || "medium").toLowerCase()] ?? SEVERITY_RISK.medium);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return round(avg + 8 * (list.length - 1));
}

/**
 * Risk specifically from accidents/collisions along a route.
 * @param {Array<Object>} incidents incidents (any type)
 * @param {Object} [opts]
 * @param {boolean} [opts.available] false when no incident source exists at all
 * @returns {number|null} 0..100 risk, or null when incident data is unavailable
 */
export function calculateAccidentRisk(incidents, { available = true } = {}) {
  if (!available) return null;
  const accidents = normalizeIncidents(incidents).filter((i) => {
    const t = String(i.type || "").toLowerCase();
    return t === "accident" || t === "collision";
  });
  if (!accidents.length) return 0;
  const ACCIDENT_RISK = { low: 30, medium: 60, high: 85, critical: 100 };
  const values = accidents.map((i) => ACCIDENT_RISK[String(i.severity || "medium").toLowerCase()] ?? ACCIDENT_RISK.medium);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return round(avg + 10 * (accidents.length - 1));
}

/**
 * Time-of-day risk profile (deterministic hour table with weekday context).
 * Rush hours and night driving carry higher baseline risk; weekday commuter
 * peaks and weekend late nights add a modifier on top of the base hour.
 * @param {Date} [date]
 * @returns {number} 0..100 risk
 */
export function calculateTimeRisk(date = new Date()) {
  // index = hour of day (0..23)
  const HOUR_RISK = [
    55, 55, 55, 55, 50, 45, // 00-05 night/early
    40, 55, 75, 75, 45, 40, // 06-11 morning rush then midday
    40, 40, 40, 45, 60, 75, // 12-17 afternoon build-up
    78, 75, 60, 50, 45, 55, // 18-23 evening rush then night
  ];
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const hour = d.getHours();
  let risk = HOUR_RISK[hour] ?? 40;
  const day = d.getDay(); // 0=Sun … 6=Sat
  const isWeekend = day === 0 || day === 6;

  if (isWeekend && (hour >= 22 || hour <= 4)) {
    risk += 12; // weekend late night: fatigue, nightlife traffic
  } else if (!isWeekend && ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18))) {
    risk += 8; // weekday commuter peak
  }
  return Math.max(0, Math.min(100, risk));
}

/** Bands for interpreting a time risk value. */
const TIME_RISK_BANDS = [
  { key: "high", label: "High risk", min: 70, color: "#dc2626" },
  { key: "elevated", label: "Elevated", min: 50, color: "#d97706" },
  { key: "typical", label: "Typical", min: 0, color: "#16a34a" },
];

/** Classify a 0..100 time risk into a labeled band. */
export function classifyTimeRisk(risk) {
  if (!Number.isFinite(risk)) return { key: "unknown", label: "—", min: 0, color: "#6b7280" };
  return TIME_RISK_BANDS.find((b) => risk >= b.min) || TIME_RISK_BANDS[TIME_RISK_BANDS.length - 1];
}

/**
 * Typical hourly risk profile for the weekday of `date` (24 values, 0..23).
 * This is a static pattern (what is *usually* risky at that hour), not a
 * real-time forecast — callers must label it as typical/expected.
 * @param {Date} [date]
 * @returns {number[]} 24 hourly risks
 */
export function hourlyTimeRiskProfile(date = new Date()) {
  const base = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const profile = [];
  for (let hour = 0; hour < 24; hour++) {
    const d = new Date(base.getTime());
    d.setHours(hour, 0, 0, 0);
    profile.push(calculateTimeRisk(d));
  }
  return profile;
}

/**
 * Find the lowest-risk contiguous window in an hourly profile (circular).
 * Ties break toward the earlier hour, so output is deterministic.
 *
 * @param {number[]} [profile] 24 hourly risks (defaults to today's profile)
 * @param {number} [windowHours] window length in hours
 * @returns {{startHour:number, endHour:number, risk:number}} averaged window risk
 */
export function getSafestWindow(profile = null, windowHours = 4) {
  const p = Array.isArray(profile) && profile.length === 24 ? profile : hourlyTimeRiskProfile();
  const len = Math.max(1, Math.min(24, Math.floor(windowHours)));
  let best = { startHour: 0, endHour: len % 24, risk: Infinity };
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += p[(start + i) % 24];
    const avg = sum / len;
    if (avg < best.risk) best = { startHour: start, endHour: (start + len) % 24, risk: Math.round(avg) };
  }
  return best;
}

/**
 * Combine available factor risks into a deterministic 0..100 safety score.
 * Unavailable factors (`null`) are excluded and their weight is removed from
 * the denominator, so missing data neither inflates nor penalizes the score.
 *
 * @param {Object} factors raw factor risks (see DEFAULT_WEIGHTS keys)
 * @param {Object} [opts]
 * @param {Object} [opts.weights] override configurable weights
 * @returns {{score:number, factorRisks:Object, missingFactors:string[], weights:Object}}
 */
export function calculateRouteSafetyScore(factors = {}, { weights = DEFAULT_WEIGHTS } = {}) {
  const used = {};
  let weightedSum = 0;
  let weightTotal = 0;
  const missingFactors = [];
  for (const [key, weight] of Object.entries(weights)) {
    const value = factors[key];
    if (value == null || !Number.isFinite(value)) {
      missingFactors.push(key);
      continue;
    }
    const risk = clampScore(value);
    used[key] = risk;
    weightedSum += weight * risk;
    weightTotal += weight;
  }
  const score = weightTotal > 0 ? round(100 - weightedSum / weightTotal) : 100;
  return { score, factorRisks: used, missingFactors, weights };
}

/**
 * Classify a 0..100 safety score into a labelled band.
 * @param {number} score
 * @returns {{key:string,label:string,color:string,min:number,max:number}}
 */
export function classifySafetyScore(score) {
  const s = clampScore(Number(score));
  return (
    SAFETY_BANDS.find((b) => s >= b.min && s <= b.max) ??
    SAFETY_BANDS[SAFETY_BANDS.length - 1]
  );
}

/* ------------------------------------------------------------------ *
 * Centralized safety intelligence facade
 * ------------------------------------------------------------------ */

/** Human labels for every scoring factor. */
export const FACTOR_LABELS = {
  traffic: "Traffic",
  pothole: "Potholes & surface",
  weather: "Weather",
  incident: "Road incidents",
  accident: "Accidents",
  time: "Time of day",
  roadCondition: "Road condition",
};

/** Maps the public input keys of calculateRoadSafetyScore to weight keys. */
const INPUT_FACTOR_KEYS = {
  traffic: "traffic",
  weather: "weather",
  potholes: "pothole",
  incidents: "incident",
  accidents: "accident",
  roadCondition: "roadCondition",
  timeRisk: "time",
};

/** Confidence levels for an intelligence result (shared vocabulary). */
export const CONFIDENCE_BANDS = [
  { key: "high", label: "High", min: 80, color: "#15803d" },
  { key: "medium", label: "Medium", min: 50, color: "#d97706" },
  { key: "low", label: "Low", min: 1, color: "#6b7280" },
  { key: "insufficient", label: "Insufficient Data", min: 0, color: "#9ca3af" },
];

/** Normalize a factor input value (number | {risk,...} | null) to a record. */
function normalizeFactorInput(value) {
  if (value == null) return { risk: null, available: false, estimated: false };
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { risk: value, available: true, estimated: false }
      : { risk: null, available: false, estimated: false };
  }
  if (typeof value === "object") {
    const risk = Number.isFinite(value.risk) ? value.risk : null;
    const available = value.available != null ? Boolean(value.available) && risk != null : risk != null;
    return { risk: available ? risk : null, available, estimated: Boolean(value.estimated) };
  }
  return { risk: null, available: false, estimated: false };
}

/**
 * Centralized road safety intelligence engine.
 *
 * Accepts structured input and returns a structured, explainable result.
 * Unavailable factors are excluded (never guessed), so the confidence level
 * communicates how much evidence backs the score.
 *
 * @param {Object} input
 * @param {number|Object|null} [input.traffic]       traffic risk (0..100)
 * @param {number|Object|null} [input.weather]       weather risk (0..100)
 * @param {number|Object|null} [input.potholes]      pothole/surface risk (0..100)
 * @param {number|Object|null} [input.incidents]     incident risk (0..100)
 * @param {number|Object|null} [input.accidents]     accident risk (0..100)
 * @param {number|Object|null} [input.roadCondition] road-condition risk (0..100)
 * @param {number|Object|null} [input.timeRisk]      time-of-day risk (0..100)
 * @param {Object} [opts]
 * @param {Object} [opts.weights] override configurable weights
 * @returns {{score:number, classification:Object, factors:Object, confidence:Object}}
 */
export function calculateRoadSafetyScore(input = {}, { weights = DEFAULT_WEIGHTS } = {}) {
  const normalized = {};
  for (const [publicKey, weightKey] of Object.entries(INPUT_FACTOR_KEYS)) {
    if (publicKey in input) normalized[weightKey] = normalizeFactorInput(input[publicKey]);
  }

  const factorRisks = {};
  for (const [key, rec] of Object.entries(normalized)) {
    if (rec.available) factorRisks[key] = rec.risk;
  }

  const { score, missingFactors, weights: usedWeights } = calculateRouteSafetyScore(factorRisks, { weights });

  // Explainable factor contributions: how much each available factor
  // lowered the score (share of the weighted risk).
  let weightTotal = 0;
  for (const key of Object.keys(factorRisks)) weightTotal += usedWeights[key] ?? 0;
  const factors = {};
  for (const key of Object.keys(weights)) {
    const rec = normalized[key];
    const available = Boolean(rec && rec.available);
    const weight = usedWeights[key] ?? weights[key];
    const contribution =
      available && weightTotal > 0 ? Math.round(((weight * factorRisks[key]) / weightTotal) * 10) / 10 : 0;
    factors[key] = {
      label: FACTOR_LABELS[key] ?? key,
      risk: available ? factorRisks[key] : null,
      weight,
      contribution,
      available,
      estimated: Boolean(rec?.estimated),
    };
  }

  // Confidence from evidence coverage: how many factors actually had data.
  const considered = Object.keys(weights).length;
  const availableCount = Object.keys(factorRisks).length;
  const coverage = considered > 0 ? availableCount / considered : 0;
  const hasEstimate = Object.values(factors).some((f) => f.available && f.estimated);

  let band;
  if (availableCount === 0) band = CONFIDENCE_BANDS[3]; // Insufficient Data
  else if (coverage < 0.5) band = CONFIDENCE_BANDS[2]; // Low
  else if (coverage < 0.8) band = CONFIDENCE_BANDS[1]; // Medium
  else band = CONFIDENCE_BANDS[0]; // High
  // An estimated core input (e.g. traffic inferred from route speeds) caps confidence at Medium.
  if (band.key === "high" && hasEstimate) band = CONFIDENCE_BANDS[1];

  const reasons = [];
  for (const f of Object.values(factors)) {
    if (f.available) reasons.push(`${f.estimated ? "⚠" : "✓"} ${f.label}${f.estimated ? " (estimated)" : " data available"}`);
  }
  for (const key of missingFactors) {
    reasons.push(`⚠ ${FACTOR_LABELS[key] ?? key} unavailable`);
  }

  return {
    score,
    classification: classifySafetyScore(score),
    factors,
    confidence: {
      level: band.key,
      label: band.label,
      color: band.color,
      score: Math.round(coverage * 100),
      availableFactors: availableCount,
      totalFactors: considered,
      reasons,
    },
  };
}

/**
 * Shared confidence assessment for any scored result, derived from how many
 * scoring factors actually had data (evidence coverage) — the same vocabulary
 * and thresholds calculateRoadSafetyScore() uses. Estimated inputs cap High
 * at Medium, and unavailable factors are listed explicitly (never guessed).
 *
 * @param {Object} factorRisks available factor risks (weight key → risk 0..100)
 * @param {Object} [opts]
 * @param {string[]} [opts.estimatedKeys] factors whose value is an estimate
 * @param {Object} [opts.weights] weight table (default DEFAULT_WEIGHTS)
 * @returns {{level:string,label:string,color:string,score:number,
 *   availableFactors:number,totalFactors:number,reasons:string[]}}
 */
export function assessFactorConfidence(
  factorRisks = {},
  { estimatedKeys = [], weights = DEFAULT_WEIGHTS } = {}
) {
  const considered = Object.keys(weights).length;
  const availableCount = Object.keys(factorRisks).filter((k) => k in weights).length;
  const coverage = considered > 0 ? availableCount / considered : 0;

  let band;
  if (availableCount === 0) band = CONFIDENCE_BANDS[3]; // Insufficient Data
  else if (coverage < 0.5) band = CONFIDENCE_BANDS[2]; // Low
  else if (coverage < 0.8) band = CONFIDENCE_BANDS[1]; // Medium
  else band = CONFIDENCE_BANDS[0]; // High
  const hasEstimate = estimatedKeys.some((k) => factorRisks[k] != null);
  if (band.key === "high" && hasEstimate) band = CONFIDENCE_BANDS[1];

  const reasons = [];
  for (const key of Object.keys(weights)) {
    const label = FACTOR_LABELS[key] ?? key;
    if (factorRisks[key] == null) reasons.push(`⚠ ${label} unavailable`);
    else if (estimatedKeys.includes(key)) reasons.push(`⚠ ${label} (estimated)`);
    else reasons.push(`✓ ${label} data available`);
  }

  return {
    level: band.key,
    label: band.label,
    color: band.color,
    score: Math.round(coverage * 100),
    availableFactors: availableCount,
    totalFactors: considered,
    reasons,
  };
}
