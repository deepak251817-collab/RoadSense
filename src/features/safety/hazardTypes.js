/**
 * Hazard type catalog.
 *
 * Single source of truth for the crowdsourced hazard types the app accepts.
 * Every report stores its `type` (legacy reports without one are treated as
 * "pothole" for backward compatibility).
 */

/** Supported hazard types (order = form order). */
export const HAZARD_TYPES = [
  { value: "pothole", label: "Pothole", category: "surface" },
  { value: "broken-road", label: "Broken Road", category: "surface" },
  { value: "waterlogging", label: "Waterlogging", category: "water" },
  { value: "fallen-tree", label: "Fallen Tree", category: "obstacle" },
  { value: "road-debris", label: "Road Debris", category: "obstacle" },
  { value: "damaged-divider", label: "Damaged Divider", category: "infrastructure" },
  { value: "signal-problem", label: "Signal Problem", category: "infrastructure" },
  { value: "construction", label: "Construction", category: "work" },
  { value: "road-closure", label: "Road Closure", category: "work" },
  { value: "poor-visibility", label: "Poor Visibility", category: "conditions" },
  { value: "other", label: "Other", category: "other" },
];

/** Type used when a report predates type support (or none chosen). */
export const DEFAULT_HAZARD_TYPE = "pothole";

const BY_VALUE = new Map(HAZARD_TYPES.map((t) => [t.value, t]));

/**
 * Metadata for a stored type value; unknown values fall back to "other"
 * semantics but keep the raw value visible for debugging.
 * @param {string|null|undefined} value
 * @returns {{value:string, label:string, category:string}}
 */
export function hazardTypeMeta(value) {
  if (!value) return BY_VALUE.get(DEFAULT_HAZARD_TYPE);
  return BY_VALUE.get(value) || { value: String(value), label: String(value), category: "other" };
}

/** Pothole surface reports (legacy untyped reports count as potholes). */
export function isPotholeType(value) {
  return !value || value === "pothole";
}

/** Waterlogging reports (used by flood/waterlogging risk intelligence). */
export function isWaterloggingType(value) {
  return value === "waterlogging";
}

