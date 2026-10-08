import React from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  ROUTE_PRIORITIES,
  ROUTE_PREFERENCES_LABEL,
  ROUTE_AVOIDANCES,
  buildExcludeParam,
  describeRoutePreferences,
} from "./routePreferences";

/**
 * Route preferences panel: pick a priority (safety / balanced / speed)
 * and optional road-avoidance toggles.
 *
 * Pure presentational — the state lives in App and is persisted to
 * localStorage. The priority only tunes the recommendation policy over
 * the SAME Mapbox alternatives; avoidance toggles map to the real
 * Mapbox `exclude` parameter (retried without it on failure).
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object} props.preferences current preference state
 * @param {Function} props.onChange nextPreferences => void
 * @param {Function} props.onClose hide the panel
 * @param {Function} [props.onApplyRoutes] optional callback: run after a
 *   change that affects route fetching (caller may re-fetch routes)
 */
export default function RoutePreferencesPanel({ show, preferences, onChange, onClose, onApplyRoutes }) {
  if (!show || !preferences) return null;

  const set = (patch) => {
    onChange({ ...preferences, ...patch });
    if (patch.avoidUnpaved != null || patch.avoidTolls != null) {
      // Exclusion changes affect the directions request itself
      onApplyRoutes?.();
    }
  };

  const exclude = buildExcludeParam(preferences);

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 p-4"
      role="region"
      aria-label="Route preferences"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 inline-flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" /> {ROUTE_PREFERENCES_LABEL}
        </h3>
        <button onClick={onClose} className="text-xs text-blue-700 dark:text-blue-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-blue-700 dark:text-blue-300">
        Priority tunes how much extra travel time a safety gain may cost when recommending among the
        routes Mapbox returns. "Avoid unpaved/tolls" are passed to the routing engine as real
        exclusions (with a fallback if the engine cannot honor them); the recommendation-level
        toggles below only decide which returned alternative may be recommended — the roads
        themselves never change.
      </div>

      {/* Priority picker */}
      <div className="flex flex-wrap gap-1.5 mb-3" role="radiogroup" aria-label="Route priority">
        {ROUTE_PRIORITIES.map((p) => (
          <button
            key={p.key}
            role="radio"
            aria-checked={preferences.priority === p.key}
            onClick={() => set({ priority: p.key })}
            className={`px-3 py-1.5 rounded-full text-[11px] border transition-colors ${
              preferences.priority === p.key
                ? "border-blue-600 bg-blue-600 text-white font-bold"
                : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white/70 dark:hover:bg-gray-800"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Avoidance toggles */}
      <div className="flex flex-wrap gap-3 mb-2 text-[11px]">
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={Boolean(preferences.avoidUnpaved)}
            onChange={(e) => set({ avoidUnpaved: e.target.checked })}
            className="w-3.5 h-3.5 rounded"
          />
          Avoid unpaved roads
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={Boolean(preferences.avoidTolls)}
            onChange={(e) => set({ avoidTolls: e.target.checked })}
            className="w-3.5 h-3.5 rounded"
          />
          Avoid tolls
        </label>
      </div>

      {/* Recommendation-level avoidance (never hides alternatives) */}
      <div className="mb-2">
        <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
          Avoid — recommendation level
        </div>
        <div className="flex flex-wrap gap-3 text-[11px]">
          {ROUTE_AVOIDANCES.map((a) => (
            <label
              key={a.key}
              title={a.hint}
              className="inline-flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-200"
            >
              <input
                type="checkbox"
                checked={Boolean(preferences[a.key])}
                onChange={(e) => set({ [a.key]: e.target.checked })}
                className="w-3.5 h-3.5 rounded"
              />
              {a.label}
            </label>
          ))}
        </div>
        <div className="mt-1 text-[9px] text-gray-500 dark:text-gray-400">
          Restricts which returned alternative may be recommended. All alternatives stay visible,
          and if every route matches an avoidance rule the recommendation falls back to all of them.
        </div>
      </div>

      <div className="text-[11px] text-blue-700 dark:text-blue-300">
        Active: <span className="font-semibold">{describeRoutePreferences(preferences)}</span>
        {exclude && (
          <span className="text-blue-500 dark:text-blue-400"> · directions exclude={exclude}</span>
        )}
        <span className="text-gray-500 dark:text-gray-400"> · saved on this device</span>
      </div>
    </div>
  );
}
