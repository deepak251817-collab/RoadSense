import React from "react";
import { CloudRain } from "lucide-react";
import { WATERLOGGING_LABEL } from "./waterlogging";

/**
 * Waterlogging / flood-risk panel for the selected route.
 *
 * Pure presentational — every number comes from assessWaterloggingRisk()
 * (rule-based estimate over real rainfall measurements, forecast data and
 * user waterlogging reports). The panel is permanently labelled
 * "Predictive estimate" so the output is never mistaken for live flood
 * telemetry or a hydrological model.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object|null} props.assessment output of assessWaterloggingRisk()
 * @param {Function} props.onClose hide the panel
 * @param {Function} props.onEnableWeather one-click fetch of route weather
 *   (shown only while rainfall data is missing)
 */
export default function WaterloggingPanel({ show, assessment, onClose, onEnableWeather }) {
  if (!show || !assessment) return null;
  const { risk, level, confidence, factors, reasons } = assessment;

  const factorRows = [
    {
      ...factors.rainfall,
      valueText: !factors.rainfall.available
        ? "No data"
        : factors.rainfall.mm != null
          ? `${factors.rainfall.mm} mm measured`
          : "No measured rain",
    },
    {
      ...factors.reports,
      valueText: `${factors.reports.count} report${factors.reports.count === 1 ? "" : "s"} nearby`,
    },
    {
      ...factors.forecast,
      valueText: !factors.forecast.available
        ? "No data"
        : factors.forecast.mm != null
          ? `${factors.forecast.mm} mm expected`
          : "Rain expected",
    },
  ];

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-900/20 p-4"
      role="region"
      aria-label="Waterlogging risk"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-sky-800 dark:text-sky-200 inline-flex items-center gap-2">
          <CloudRain className="w-4 h-4" aria-hidden="true" /> Waterlogging &amp; flood risk
        </h3>
        <button onClick={onClose} className="text-xs text-sky-700 dark:text-sky-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-sky-700 dark:text-sky-300">
        {WATERLOGGING_LABEL} — rule-based estimate from measured rainfall, forecast rain and
        user waterlogging reports. Not live flood telemetry or a drainage model.
      </div>

      {/* Score card + factor breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <div className="rounded-xl border border-sky-200 dark:border-sky-700 bg-white/70 dark:bg-gray-900/50 p-3">
          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
            Waterlogging risk
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
          {!factors.rainfall.available && onEnableWeather && (
            <button
              onClick={onEnableWeather}
              className="mt-2 w-full text-[11px] font-semibold px-2 py-1 rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors"
            >
              Fetch route weather
            </button>
          )}
        </div>
        <div className="sm:col-span-2 rounded-xl border border-sky-200 dark:border-sky-700 bg-white/70 dark:bg-gray-900/50 p-3">
          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
            Evidence
          </div>
          <ul className="space-y-1.5">
            {factorRows.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${f.available ? "" : "opacity-40"}`}
                  style={{ backgroundColor: f.available && f.risk != null ? (f.risk >= 60 ? "#f97316" : f.risk >= 30 ? "#eab308" : "#22c55e") : "#9ca3af" }}
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

      {/* Why list */}
      <div className="rounded-xl border border-sky-200 dark:border-sky-700 bg-white/70 dark:bg-gray-900/50 p-3">
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
