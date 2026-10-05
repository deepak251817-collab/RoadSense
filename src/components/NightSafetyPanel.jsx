import React from "react";
import { Moon, Sun } from "lucide-react";
import { NIGHT_SAFETY_LABEL, NIGHT_WINDOW } from "../utils/nightSafety";

/**
 * Night safety panel for the selected route.
 *
 * Pure presentational — every number comes from assessNightSafety()
 * (rule-based estimate over real time-of-day, nearby hazards, fetched
 * weather and incidents). The panel is permanently labelled
 * "Predictive estimate" and the darkness window is explicitly called
 * out as a fixed approximation, not sunrise/sunset data.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object|null} props.assessment output of assessNightSafety()
 * @param {Function} props.onClose hide the panel
 */
export default function NightSafetyPanel({ show, assessment, onClose }) {
  if (!show || !assessment) return null;
  const { risk, isNight, level, confidence, factors, reasons, advice } = assessment;

  const factorRows = [
    {
      ...factors.darkness,
      valueText: isNight
        ? `Night (${NIGHT_WINDOW.startHour}:00–${NIGHT_WINDOW.endHour}:00)`
        : "Daytime",
    },
    {
      ...factors.hazards,
      valueText: `${factors.hazards.count} report${factors.hazards.count === 1 ? "" : "s"} nearby`,
    },
    {
      ...factors.visibility,
      valueText: factors.visibility.available
        ? `${factors.visibility.condition || "weather"} along route`
        : "No data",
    },
    {
      ...factors.incidents,
      valueText: factors.incidents.available
        ? factors.incidents.risk > 0
          ? "Incidents reported"
          : "No incidents"
        : "No data",
    },
  ];

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-900/20 p-4"
      role="region"
      aria-label="Night safety"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 inline-flex items-center gap-2">
          {isNight ? <Moon className="w-4 h-4" aria-hidden="true" /> : <Sun className="w-4 h-4" aria-hidden="true" />}
          Night safety
        </h3>
        <button onClick={onClose} className="text-xs text-indigo-700 dark:text-indigo-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-indigo-700 dark:text-indigo-300">
        {NIGHT_SAFETY_LABEL} — rule-based estimate from time of day (fixed{" "}
        {NIGHT_WINDOW.startHour}:00–{NIGHT_WINDOW.endHour}:00 window, not sunrise/sunset data),
        nearby hazards, fetched weather and incidents. Not an accident prediction.
      </div>

      {/* Score card + factor breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white/70 dark:bg-gray-900/50 p-3">
          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
            Night-safety risk
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold" style={{ color: level.color }}>
              {risk == null ? "—" : risk}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: level.color }}
            >
              {level.label}
            </span>
          </div>
          <div
            className="text-[10px] font-semibold mt-1"
            style={{ color: confidence.color }}
            title={confidence.reasons?.join(" · ")}
          >
            Confidence: {confidence.label}
          </div>
        </div>
        <div className="sm:col-span-2 rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white/70 dark:bg-gray-900/50 p-3">
          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
            Evidence
          </div>
          <ul className="space-y-1.5">
            {factorRows.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${f.available ? "" : "opacity-40"}`}
                  style={{
                    backgroundColor:
                      f.available && f.risk != null
                        ? f.risk >= 60
                          ? "#f97316"
                          : f.risk >= 30
                            ? "#eab308"
                            : "#22c55e"
                        : "#9ca3af",
                  }}
                  aria-hidden="true"
                />
                <span className="font-medium text-gray-700 dark:text-gray-200">{f.label}</span>
                <span className="text-gray-500 dark:text-gray-400">{f.valueText}</span>
                <span className="ml-auto font-semibold text-gray-600 dark:text-gray-300">
                  {f.available && f.risk != null ? `${f.risk}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Actionable advice derived from the same evidence */}
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white/70 dark:bg-gray-900/50 p-3 mb-3">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1">
          Driving advice
        </div>
        <ul className="space-y-0.5">
          {advice.map((a) => (
            <li key={a} className="text-[11px] text-gray-600 dark:text-gray-300">
              • {a}
            </li>
          ))}
        </ul>
      </div>

      {/* Why list */}
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-white/70 dark:bg-gray-900/50 p-3">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1">Why</div>
        <ul className="space-y-0.5">
          {reasons.map((r) => (
            <li key={r} className="text-[11px] text-gray-600 dark:text-gray-300">
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
