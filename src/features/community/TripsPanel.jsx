import React, { memo } from "react";

/**
 * Trip history panel with aggregate stats. Pure presentational.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Array} props.trips persisted trip history (newest first)
 * @param {Object} props.stats tripSummary() aggregate
 * @param {Function} props.onClear clear history
 * @param {Function} props.onClose hide the panel
 */
function TripsPanel({ show, trips = [], stats, onClear, onClose }) {
  if (!show) return null;
  return (
    <div
      className="mt-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-900/20 p-4"
      role="region"
      aria-label="Trip history"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Trip history</h3>
        <div className="flex items-center gap-3">
          {trips.length > 0 && (
            <button onClick={onClear} className="text-xs text-red-600 dark:text-red-400 underline">
              Clear
            </button>
          )}
          <button onClick={onClose} className="text-xs text-indigo-700 dark:text-indigo-300 underline">
            Hide
          </button>
        </div>
      </div>
      {stats && stats.tripCount > 0 && (
        <>
          {/* Safety analytics dashboard — every value derived from recorded trips */}
          <div className="mb-2 grid grid-cols-2 lg:grid-cols-3 gap-1.5 text-[11px]">
            <Metric label="Trips" value={String(stats.tripCount)} />
            <Metric
              label="Average safety"
              value={stats.avgSafety != null ? String(stats.avgSafety) : "— no scored trips"}
            />
            <Metric
              label="Scored trips"
              value={`${stats.scoredCount ?? 0} of ${stats.tripCount}`}
            />
            <Metric label="Hazards encountered" value={String(stats.hazardsEncountered ?? 0)} />
            <Metric
              wide
              label="Safest route"
              value={
                stats.safestRoute
                  ? `${stats.safestRoute.safetyScore} · ${stats.safestRoute.label}`
                  : "— no scored trips"
              }
            />
            <Metric
              wide
              label="Most frequent route"
              value={
                stats.mostFrequentRoute
                  ? `${stats.mostFrequentRoute.count}× · ${stats.mostFrequentRoute.label}`
                  : "— no trips"
              }
            />
          </div>
          <div className="mb-2 text-[11px] text-indigo-900 dark:text-indigo-200 bg-white/70 dark:bg-gray-900/50 rounded-lg px-3 py-2 border border-indigo-200 dark:border-indigo-800">
            {stats.totalKm} km driven · arrived {stats.arrivedCount} · weather recorded on{" "}
            {stats.withWeather ?? 0} trip{(stats.withWeather ?? 0) === 1 ? "" : "s"}
          </div>
        </>
      )}
      {trips.length === 0 ? (
        <p className="stars-empty">
          No trips yet. Select a route and it will be recorded here with its safety score.
        </p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {trips.slice(0, 20).map((t) => {
            const isActive = t.endedAt == null;
            const score = t.safetyScore;
            const scoreColor =
              score == null ? "#6b7280" : score >= 75 ? "#16a34a" : score >= 60 ? "#d97706" : "#dc2626";
            return (
              <li
                key={t.id}
                className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-900 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                    {t.originLabel || `${t.originCoord[1].toFixed(3)},${t.originCoord[0].toFixed(3)}`}
                    {" → "}
                    {t.destLabel || `${t.destCoord[1].toFixed(3)},${t.destCoord[0].toFixed(3)}`}
                  </span>
                  <span
                    className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                        : t.arrived
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {isActive ? "IN PROGRESS" : t.arrived ? "ARRIVED" : "ENDED"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
                  <span>{new Date(t.startedAt).toLocaleString()}</span>
                  <span>· Route {t.routeIndex + 1}</span>
                  {t.distanceMeters != null && <span>· {(t.distanceMeters / 1000).toFixed(1)} km</span>}
                  {t.durationMinutes != null && <span>· {t.durationMinutes} min</span>}
                  {t.weather && (
                    <span className="truncate max-w-[8rem]" title="Weather recorded at trip start">
                      · {t.weather}
                    </span>
                  )}
                  {score != null && (
                    <span
                      className="font-bold px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: scoreColor }}
                      title={`Safety score${t.classification ? ` — ${t.classification}` : ""}`}
                    >
                      {score}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One dashboard metric tile. Label above, value below, truncates cleanly. */
function Metric({ label, value, wide = false }) {
  return (
    <div
      className={`rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white/70 dark:bg-gray-900/50 px-2 py-1 ${
        wide ? "col-span-2" : ""
      }`}
      title={`${label}: ${value}`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-300">
        {label}
      </div>
      <div className="font-semibold text-indigo-900 dark:text-indigo-100 truncate">{value}</div>
    </div>
  );
}

export default memo(TripsPanel);
