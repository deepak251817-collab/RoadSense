/**
 * Night safety assessment.
 *
 * Deterministic, rule-based estimate of the extra risk that driving at
 * night adds along a route, built only from evidence the app actually has:
 *   - the current local time (darkness window — a documented fixed
 *     approximation, NOT astronomical sunrise/sunset data)
 *   - active hazard reports near the route (unlit potholes/waterlogging
 *     are far harder to see after dark)
 *   - weather sample points when fetched (fog/mist/haze cut night
 *     visibility much harder than daytime visibility)
 *   - route incidents when an incident source exists
 *
 * This is NOT a prediction of an accident and NOT lighting/sunrise data.
 * Results must always be presented with the NIGHT_SAFETY_LABEL
 * ("Predictive estimate") label. Missing inputs are excluded (never
 * guessed); confidence communicates how much evidence backs the estimate.
 */
import { pointLineDistMeters, isValidCoord } from "../routing/geo";
import { CONFIDENCE_BANDS, calculateTimeRisk } from "../safety/safetyScore";

/** Display label that must accompany every night-safety number in the UI. */
export const NIGHT_SAFETY_LABEL = "Predictive estimate";

/**
 * Darkness window (local time, inclusive start, exclusive end).
 * A fixed approximation of dusk/dawn — not computed sunrise/sunset.
 */
export const NIGHT_WINDOW = { startHour: 19, endHour: 6 };

/** Relative weight of each evidence factor (renormalized over available ones). */
export const NIGHT_WEIGHTS = {
  darkness: 0.35, // time inside the darkness window (always known)
  hazards: 0.30, // active reports near the route
  visibility: 0.20, // fog/mist/haze from fetched weather points
  incidents: 0.15, // route incidents when a source exists
};

/** How far from the route (meters) a hazard report still counts. */
export const NIGHT_HAZARD_THRESHOLD_METERS = 120;

/**
 * Risk bands for a 0..100 night-safety risk (higher = worse).
 * Colors match the segment-risk palette.
 */
export const NIGHT_BANDS = [
  { key: "severe", label: "Severe", min: 80, color: "#ef4444" },
  { key: "high", label: "High", min: 60, color: "#f97316" },
  { key: "moderate", label: "Moderate", min: 30, color: "#eab308" },
  { key: "low", label: "Low", min: 0, color: "#22c55e" },
];

const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/** Classify a 0..100 night-safety risk into a labeled band. */
export function classifyNightRisk(risk) {
  if (!Number.isFinite(risk)) {
    return { key: "unknown", label: "Unknown", min: 0, color: "#9ca3af" };
  }
  const r = clamp(risk);
  return NIGHT_BANDS.find((b) => r >= b.min) || NIGHT_BANDS[NIGHT_BANDS.length - 1];
}

/** True when `date` falls inside the darkness window (fixed approximation). */
export function isNightTime(date = new Date(), window = NIGHT_WINDOW) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const h = d.getHours();
  const { startHour, endHour } = window;
  if (startHour > endHour) return h >= startHour || h < endHour; // window wraps midnight
  return h >= startHour && h < endHour;
}

/**
 * 0..100 risk contribution of the darkness window itself.
 * Deeper into the night = higher risk; edges of the window = lower.
 * Returns null when the date is unusable.
 */
export function darknessRisk(date = new Date(), window = NIGHT_WINDOW) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  if (!isNightTime(d, window)) return 0; // daytime: no darkness risk
  const h = d.getHours();
  const { startHour, endHour } = window;
  // Hour index inside the night window (0 = first night hour)
  const len = ((endHour - startHour) + 24) % 24;
  const idx = ((h - startHour) + 24) % 24;
  const position = len > 1 ? idx / (len - 1) : 0; // 0..1 across the night
  // Curve: rises through the evening, peaks around 01:00-03:00, eases before dawn
  const shaped = Math.sin(position * Math.PI); // 0 → 1 → 0
  return Math.round(55 + shaped * 35); // 55..90
}

/** 0..100 visibility risk from a weather main/description label (night-weighted). */
export function nightVisibilityRiskFromWeather(main, description = "") {
  const m = String(main || "").toLowerCase();
  const desc = String(description || "").toLowerCase();
  if (m === "fog") return 90;
  if (m === "mist") return 75;
  if (m === "haze") return 65;
  if (m === "smoke") return 70;
  if (m === "drizzle") return 45;
  if (m === "rain") return desc.includes("heavy") ? 65 : 50;
  if (m === "thunderstorm") return 70;
  if (m === "snow" || m === "sleet") return 75;
  if (m === "clear" || m === "clouds") return 5;
  return null; // unknown condition — unavailable, not guessed
}

/** Collect active hazard reports near a route (same visibility rules as the map). */
export function collectNightHazards(route, reports, _opts = {}, thresholdMeters = NIGHT_HAZARD_THRESHOLD_METERS) {
  const empty = { items: [], count: 0, highCount: 0 };
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(reports)) return empty;
  const items = [];
  let highCount = 0;
  for (const rep of reports) {
    if (!rep || typeof rep !== "object") continue;
    if (!isValidCoord(rep.coord)) continue;
    if (rep.hiddenGlobally || rep.hiddenForUser) continue;
    if (rep.status === "rejected" || rep.status === "fixed") continue;
    const d = pointLineDistMeters(rep.coord, coords);
    if (isFinite(d) && d <= thresholdMeters) {
      items.push(rep);
      if (rep.severity === "high") highCount += 1;
    }
  }
  return { items, count: items.length, highCount };
}

/** 0..100 risk from active hazard reports near the route at night. */
export function nightHazardRisk({ count = 0, highCount = 0, distanceMeters = null } = {}) {
  const total = Math.max(0, count || 0);
  if (total === 0) return 0;
  const high = Math.max(0, Math.min(highCount || 0, total));
  const distanceKm = Number.isFinite(distanceMeters) && distanceMeters > 0 ? distanceMeters / 1000 : null;
  const perKm = distanceKm ? total / distanceKm : total;
  const density = Math.min(55, perKm * 24);
  const severity = high * 11 + (total - high) * 4;
  return Math.round(Math.max(0, Math.min(100, density + severity)));
}

/**
 * Assess night-safety risk for a route.
 *
 * @param {Object} input
 * @param {Object} [input.route] Mapbox route
 * @param {Array}  [input.reports] all user reports
 * @param {Array}  [input.weatherPoints] fetched OpenWeather points for the route
 * @param {Array|null} [input.incidents] route incidents (null = source unavailable)
 * @param {boolean} [input.incidentsAvailable] force incidents availability
 * @param {Date}   [input.now] base time (injectable for deterministic tests)
 * @returns {{risk:number|null, isNight:boolean, level:Object, label:string,
 *   factors:Object, confidence:Object, reasons:string[], advice:string[]}}
 */
export function assessNightSafety({
  route = null,
  reports = [],
  weatherPoints = [],
  incidents = null,
  incidentsAvailable = null,
  now = new Date(),
} = {}) {
  const distanceMeters = Number(route?.distance) || null;
  const night = isNightTime(now);

  // --- Factor 1: darkness (time is always known) --------------------------
  const dark = darknessRisk(now);

  // --- Factor 2: active hazards near the route ----------------------------
  const near = collectNightHazards(route, reports);
  const hazard = nightHazardRisk({
    count: near.count,
    highCount: near.highCount,
    distanceMeters,
  });

  // --- Factor 3: visibility weather at night (only when fetched) ----------
  // Worst sample along the route; its condition label travels with the score.
  let visibility = null;
  let visibilityLabel = null;
  if (Array.isArray(weatherPoints) && weatherPoints.length) {
    let worst = null;
    for (const p of weatherPoints) {
      const w = p?.data ?? p;
      const main = w?.weather?.[0]?.main;
      const desc = w?.weather?.[0]?.description;
      const r = nightVisibilityRiskFromWeather(main, desc);
      if (r != null && (worst == null || r > worst.risk)) {
        worst = { risk: r, label: main ? String(main) : null };
      }
    }
    if (worst) {
      visibility = worst.risk;
      visibilityLabel = worst.label;
    }
  }

  // --- Factor 4: incidents (only when a source exists) --------------------
  const incidentsExist = incidentsAvailable != null ? Boolean(incidentsAvailable) : Array.isArray(incidents);
  let incidentRisk = null;
  if (incidentsExist) {
    const list = Array.isArray(incidents) ? incidents : [];
    if (!list.length) {
      incidentRisk = 0;
    } else {
      const SEV = { low: 30, medium: 60, high: 85, critical: 95 };
      const values = list.map((i) => SEV[String(i?.severity || "medium").toLowerCase()] ?? 60);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      incidentRisk = Math.round(Math.max(0, Math.min(100, avg + 6 * (list.length - 1))));
    }
  }

  const factors = {
    darkness: { key: "darkness", label: "Darkness", risk: dark, available: true, night },
    hazards: {
      key: "hazards",
      label: "Hazards near route",
      risk: hazard,
      available: true,
      count: near.count,
      highCount: near.highCount,
    },
    visibility: {
      key: "visibility",
      label: "Night visibility",
      risk: visibility,
      available: visibility != null,
      condition: visibilityLabel,
    },
    incidents: { key: "incidents", label: "Road incidents", risk: incidentRisk, available: incidentRisk != null },
  };

  // --- Combine (weights renormalized over available factors) --------------
  let weighted = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(NIGHT_WEIGHTS)) {
    const f = factors[key];
    if (!f.available) continue;
    weighted += weight * clamp(f.risk);
    weightTotal += weight;
  }
  const risk = weightTotal > 0 ? Math.round(weighted / weightTotal) : null;

  // --- Confidence from evidence coverage ----------------------------------
  const evidence = {
    darkness: factors.darkness.available,
    hazards: factors.hazards.available,
    visibility: factors.visibility.available,
    incidents: factors.incidents.available,
  };
  const evidenceCount = Object.values(evidence).filter(Boolean).length;
  const coverage = evidenceCount / Object.keys(evidence).length;
  let band = CONFIDENCE_BANDS[3];
  if (coverage >= 0.75) band = CONFIDENCE_BANDS[0];
  else if (coverage >= 0.5) band = CONFIDENCE_BANDS[1];
  else if (coverage > 0) band = CONFIDENCE_BANDS[2];

  const reasons = [];
  reasons.push(
    night
      ? `✓ Inside the ${NIGHT_WINDOW.startHour}:00–${NIGHT_WINDOW.endHour}:00 darkness window (fixed approximation, not sunrise/sunset data)`
      : "✓ Daytime — no darkness risk in this window"
  );
  if (near.count > 0) {
    reasons.push(`✓ ${near.count} active hazard report${near.count === 1 ? "" : "s"} within ${NIGHT_HAZARD_THRESHOLD_METERS} m of the route${near.highCount ? ` (${near.highCount} high severity)` : ""}`);
  } else {
    reasons.push("✓ No active hazard reports near the route");
  }
  if (evidence.visibility) {
    reasons.push(`✓ Night visibility weather: ${visibilityLabel || "unknown condition"} (worst sample along route)`);
  } else {
    reasons.push("⚠ No route weather fetched — night visibility unknown (open the Weather layer)");
  }
  if (evidence.incidents) {
    const list = Array.isArray(incidents) ? incidents : [];
    reasons.push(list.length ? `✓ ${list.length} incident${list.length === 1 ? "" : "s"} reported on/near the route` : "✓ No incidents reported for this route");
  } else {
    reasons.push("⚠ Incident source unavailable for this route");
  }

  // --- Actionable advice derived from the same evidence -------------------
  const advice = [];
  if (night) {
    advice.push("Use low beam in the city; switch to high beam only on unlit stretches without oncoming traffic.");
    if ((factors.visibility.risk ?? 0) >= 60) {
      advice.push(`Reduced visibility (${visibilityLabel || "poor conditions"}) — slow down and increase following distance.`);
    }
    if (near.count > 0) {
      advice.push(`${near.count} hazard${near.count === 1 ? "" : "s"} reported ahead — potholes and puddles are hard to spot after dark; keep left and reduce speed.`);
    }
    if ((factors.darkness.risk ?? 0) >= 80) {
      advice.push("Deep-night fatigue risk — take a break if you feel drowsy.");
    }
    advice.push("Watch for pedestrians and two-wheelers near the kerb; they are less visible at night.");
  } else {
    advice.push("Daytime driving — standard precautions apply.");
    if (near.count > 0) {
      advice.push(`${near.count} hazard report${near.count === 1 ? "" : "s"} near the route — still worth avoiding even in daylight.`);
    }
  }

  return {
    risk,
    isNight: night,
    level: classifyNightRisk(risk),
    label: NIGHT_SAFETY_LABEL,
    factors,
    confidence: {
      level: band.key,
      label: band.label,
      color: band.color,
      score: Math.round(coverage * 100),
      availableEvidence: evidenceCount,
      totalEvidence: Object.keys(evidence).length,
      reasons,
    },
    evidence,
    reasons,
    advice,
    // Reference value from the shared time-of-day engine (for display parity)
    timeRisk: calculateTimeRisk(now),
  };
}
