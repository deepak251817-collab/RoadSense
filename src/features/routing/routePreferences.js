/**
 * User route preferences.
 *
 * Three concerns, kept strictly separated:
 *
 * 1. PRIORITY (safest / balanced / fastest): tunes the recommendation
 *    policy used by utils/recommendation. It never invents routes — the
 *    same alternatives come back from Mapbox; the preference decides how
 *    much extra travel time a safety gain is allowed to cost.
 *
 * 2. ROAD AVOIDANCE (unpaved, tolls): mapped to the Mapbox Directions
 *    `exclude` parameter. Directions requests that fail while an exclude
 *    is active are retried WITHOUT it (graceful degradation) — an
 *    unsupported exclusion must never cost the user their routes.
 *
 * 3. Persistence: preferences live in localStorage and survive reloads.
 *
 * Nothing here fabricates data: every preference either changes a
 * documented policy constant or a real API parameter.
 */
import {
  PRIORITY_WEIGHTS,
} from "./recommendation";

/** localStorage key for the user's route preferences. */
const ROUTE_PREFERENCES_KEY = "routePreferences";

/** Display label for the preference feature in the UI. */
export const ROUTE_PREFERENCES_LABEL = "Route preferences";

/** Supported route priorities (recommendation policy). */
export const ROUTE_PRIORITIES = [
  { key: "safest", label: "Safety First" },
  { key: "balanced", label: "Balanced" },
  { key: "fastest", label: "Time First" },
];

/**
 * Recommendation-level avoidance toggles. Mapbox `exclude` cannot express
 * these (it only knows toll/ferry/unpaved), so they filter which of the
 * ALREADY RETURNED alternatives may be recommended — the roads Mapbox
 * routes you on never change, and all alternatives stay visible.
 */
export const ROUTE_AVOIDANCES = [
  { key: "avoidHighRiskRoutes", label: "High-risk routes", hint: "don't recommend routes classified Risky / High Risk" },
  { key: "avoidSevereHazards", label: "Severe hazards", hint: "don't recommend routes with active high-severity hazards alongside" },
  { key: "avoidWaterlogging", label: "Waterlogged areas", hint: "don't recommend routes with active waterlogging reports alongside" },
  { key: "avoidIncidents", label: "Reported incidents", hint: "don't recommend routes with incidents alongside (when a feed is connected)" },
];

/** Default preference state. */
export const DEFAULT_ROUTE_PREFERENCES = {
  priority: "balanced",
  avoidUnpaved: false,
  avoidTolls: false,
  avoidHighRiskRoutes: false,
  avoidSevereHazards: false,
  avoidWaterlogging: false,
  avoidIncidents: false,
};

/**
 * Weighted recommendation policy per priority (see PRIORITY_WEIGHTS):
 *
 * - Safety First: 70% safety / 30% travel time.
 * - Balanced: 50% safety / 50% travel time.
 * - Time First: 30% safety / 70% travel time.
 *
 * Alternative routes are never removed — the weights only decide which
 * route gets recommended.
 *
 * @param {string} priority one of ROUTE_PRIORITIES keys
 * @returns {Object} config for recommendRoute()
 */
export function recommendationConfigFor(priority) {
  const weights = PRIORITY_WEIGHTS[priority] || PRIORITY_WEIGHTS.balanced;
  return { weights: { ...weights } };
}

/**
 * Mapbox `exclude` value for the avoidance toggles.
 * @param {Object} prefs
 * @returns {string|null} null when nothing should be excluded
 */
export function buildExcludeParam(prefs = {}) {
  const parts = [];
  if (prefs.avoidUnpaved) parts.push("unpaved");
  if (prefs.avoidTolls) parts.push("toll");
  return parts.length ? parts.join(",") : null;
}

/** True when the priorities list contains `key`. */
export function isValidPriority(key) {
  return ROUTE_PRIORITIES.some((p) => p.key === key);
}

/** Normalize any stored/unknown value into a valid preference state. */
export function normalizeRoutePreferences(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    priority: isValidPriority(src.priority) ? src.priority : DEFAULT_ROUTE_PREFERENCES.priority,
    avoidUnpaved: Boolean(src.avoidUnpaved),
    avoidTolls: Boolean(src.avoidTolls),
    avoidHighRiskRoutes: Boolean(src.avoidHighRiskRoutes),
    avoidSevereHazards: Boolean(src.avoidSevereHazards),
    avoidWaterlogging: Boolean(src.avoidWaterlogging),
    avoidIncidents: Boolean(src.avoidIncidents),
  };
}

/** Safety band keys that count as "high risk" for avoidance. */
const HIGH_RISK_BAND_KEYS = ["risky", "high-risk"];

/**
 * Apply the avoidance toggles to analyzed routes. Pure and conservative:
 *
 * - Each enabled toggle drops routes that match its rule.
 * - If the filters would drop EVERY alternative, nothing is dropped —
 *   avoidance must never leave the user with no recommendation.
 *
 * @param {Array} analyses analyzed routes (analyzeRoutes output)
 * @param {Object} prefs normalized preferences
 * @returns {{list:Array, dropped:number, allDropped:boolean}}
 */
export function applyAvoidPreferences(analyses, prefs = {}) {
  const list = Array.isArray(analyses) ? analyses.filter(Boolean) : [];
  if (!list.length) return { list, dropped: 0, allDropped: false };
  const keep = list.filter((a) => {
    if (prefs.avoidHighRiskRoutes && HIGH_RISK_BAND_KEYS.includes(a.classification?.key)) return false;
    if (prefs.avoidSevereHazards && (a.potholes?.highCount || 0) > 0) return false;
    if (prefs.avoidWaterlogging && (a.waterlogging?.count || 0) > 0) return false;
    if (prefs.avoidIncidents && a.incidents?.available && (a.incidents?.count || 0) > 0) return false;
    return true;
  });
  const dropped = list.length - keep.length;
  if (!keep.length) return { list, dropped, allDropped: true };
  return { list: keep, dropped, allDropped: false };
}

/** Load preferences from storage (corruption-tolerant). */
export function loadRoutePreferences(storage = null) {
  try {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return { ...DEFAULT_ROUTE_PREFERENCES };
    const raw = s.getItem(ROUTE_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_ROUTE_PREFERENCES };
    return normalizeRoutePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ROUTE_PREFERENCES };
  }
}

/** Persist preferences (best-effort). */
export function saveRoutePreferences(prefs, storage = null) {
  try {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return false;
    s.setItem(ROUTE_PREFERENCES_KEY, JSON.stringify(normalizeRoutePreferences(prefs)));
    return true;
  } catch {
    return false;
  }
}

/** Human-readable one-liner for the active preference (UI copy). */
export function describeRoutePreferences(prefs = {}) {
  const p = normalizeRoutePreferences(prefs);
  const priority = ROUTE_PRIORITIES.find((x) => x.key === p.priority)?.label || "Balanced";
  const avoid = [];
  if (p.avoidUnpaved) avoid.push("unpaved roads");
  if (p.avoidTolls) avoid.push("tolls");
  const avoidText = avoid.length ? ` · avoiding ${avoid.join(" & ")}` : "";
  return `${priority}${avoidText}`;
}
