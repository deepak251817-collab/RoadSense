import React from "react";
import { Activity } from "lucide-react";
import { ROAD_HEALTH_LABEL } from "./roadHealth";

/**
 * Road health index panel.
 *
 * Pure presentational — every number comes from roadHealthIndex()
 * (descriptive statistics over the stored crowd reports). The panel is
 * permanently labelled "Report-based index" so it is never mistaken for
 * a physical road inspection, and the no-data case is shown as
 * "Insufficient Data" rather than a perfect score.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object|null} props.health output of roadHealthIndex()
 * @param {Function} props.onClose hide the panel
 */
export default function RoadHealthPanel({ show, health, onClose }) {
  if (!show || !health) return null;
  const { index, grade, factors, confidence, counts, reasons } = health;

  const factorRows = [
    {
      ...factors.pressure,
      detail: factors.pressure
        ? `${factors.pressure.weightedActive} severity-weighted active report${factors.pressure.weightedActive === 1 ? "" : "s"} → −${factors.pressure.penalty}`
        : "—",
      good: factors.pressure ? factors.pressure.value < 40 : false,
    },
    {
      ...factors.severity,
      detail: factors.severity
        ? `${factors.severity.activeHigh}/${factors.severity.active} high or critical → −${factors.severity.penalty}`
        : "—",
      good: factors.severity ? factors.severity.value < 30 : false,
    },
    {
      ...factors.repairs,
      detail: factors.repairs
        ? `${factors.repairs.fixed}/${factors.repairs.usable} fixed → +${factors.repairs.credit}`
        : "—",
      good: factors.repairs ? factors.repairs.value >= 30 : false,
    },
  ];

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20 p-4"
      role="region"
      aria-label="Road health index"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 inline-flex items-center gap-2">
          <Activity className="w-4 h-4" aria-hidden="true" /> Road health index
        </h3>
        <button onClick={onClose} className="text-xs text-emerald-700 dark:text-emerald-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-emerald-700 dark:text-emerald-300">
        {ROAD_HEALTH_LABEL} — descriptive statistics over the crowd reports stored in this app.
        Not a physical road inspection and not a prediction.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        {/* Index score */}
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-white/70 dark:bg-gray-900/50 p-3">
          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Health index</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold" style={{ color: grade.color }}>
              {index == null ? "—" : index}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: grade.color }}
            >
              {grade.label}
            </span>
          </div>
          <div
            className="text-[10px] font-semibold mt-1"
            style={{ color: confidence.color }}
            title={confidence.reasons?.join(" · ")}
          >
            Confidence: {confidence.label}
          </div>
          {/* Progress bar toward 100 */}
          <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${index == null ? 0 : index}%`, backgroundColor: grade.color }}
            />
          </div>
        </div>

        {/* Factor breakdown */}
        <div className="sm:col-span-2 rounded-xl border border-emerald-200 dark:border-emerald-700 bg-white/70 dark:bg-gray-900/50 p-3">
          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
            What drives the index
          </div>
          {index == null ? (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              Not enough usable reports to compute an index yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {factorRows.map((f) => (
                <li key={f.key} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: f.good ? "#22c55e" : "#f97316" }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-gray-700 dark:text-gray-200">{f.label}</span>
                  <span className="text-gray-500 dark:text-gray-400 truncate">{f.detail}</span>
                  <span className="ml-auto font-semibold text-gray-600 dark:text-gray-300">
                    {f.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Database counts */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-white/70 dark:bg-gray-900/50 p-3 mb-3">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1.5">
          Report database
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 font-medium">
            {counts.active} active
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 font-medium">
            {counts.fixed} fixed
          </span>
          {counts.rejected > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 font-medium">
              {counts.rejected} rejected
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 font-medium">
            {counts.severityMix.high + counts.severityMix.critical} high/critical active
          </span>
        </div>
      </div>

      {/* Why list */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-white/70 dark:bg-gray-900/50 p-3">
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
