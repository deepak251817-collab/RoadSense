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
export const ROUTE_PREFERENCES_KEY = "routePreferences";

/** Display label for the preference feature in the UI. */
export const ROUTE_PREFERENCES_LABEL = "Route preferences";

/** Supported route priorities (recommendation policy). */
export const ROUTE_PRIORITIES = [
  { key: "safest", label: "Safety First" },
  { key: "balanced", label: "Balanced" },
  { key: "fastest", label: "Time First" },
];

/** Default preference state. */
export const DEFAULT_ROUTE_PREFERENCES = {
  priority: "balanced",
  avoidUnpaved: false,
  avoidTolls: false,
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
  };
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
