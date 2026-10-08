import React from "react";
import { HOTSPOT_CONFIG } from "./hotspots";

/**
 * Ranked hazard hotspot list. Pure presentational.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Array} props.hotspots ranked hotspots from detectHotspots()
 * @param {boolean} props.hasReports whether any reports exist at all
 * @param {Function} props.onClose hide the panel
 * @param {Function} props.onFocus fly to a hotspot coord
 */
export default function HotspotsPanel({ show, hotspots = [], hasReports, onClose, onFocus }) {
  if (!show) return null;
  return (
    <div
      className="mt-4 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 p-4"
      role="region"
      aria-label="Hazard hotspots"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Hazard hotspots</h3>
        <button onClick={onClose} className="text-xs text-amber-700 dark:text-amber-300 underline">
          Hide
        </button>
      </div>
      {hotspots.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {hasReports
            ? "No hotspot zones found — active hazards are spread out rather than concentrated."
            : "No hazard reports yet. Hotspots appear once 2+ active hazards cluster within 150 m."}
        </p>
      ) : (
        <ul className="space-y-2">
          {hotspots.map((h, i) => (
            <li key={h.id}>
              <button
                onClick={() => onFocus(h.coord)}
                className="w-full flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-900 px-3 py-2 text-left hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              >
                <span className="w-7 h-7 flex-shrink-0 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {h.label}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Risk {h.score}/100 · ~{h.radiusMeters} m zone
                    {h.recentCount > 0
                      ? ` · ${h.recentCount} new in last ${HOTSPOT_CONFIG.recentDays}d`
                      : ""}
                  </span>
                  <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                    Evidence: {h.count} report{h.count === 1 ? "" : "s"} in zone ({h.activeCount} active)
                  </span>
                </span>
                <span
                  className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
                    h.severity === "high"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                  }`}
                >
                  {h.severity === "high" ? "HIGH" : h.severity.toUpperCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
