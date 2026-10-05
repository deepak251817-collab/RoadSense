import React from "react";
import { FlaskConical } from "lucide-react";
import { WHAT_IF_LABEL, WHAT_IF_MODES } from "../utils/whatIf";

/**
 * What-if simulation panel: pick a repair scenario and see the before /
 * after produced by the real scoring engines.
 *
 * Pure presentational — every number comes from runWhatIf(). The panel is
 * permanently labelled "Scenario Simulation" and repeats the hypothetical
 * caveat, so simulated deltas are never mistaken for achieved results.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object|null} props.result output of runWhatIf()
 * @param {string} props.mode current selection mode
 * @param {Function} props.onModeChange mode key => void
 * @param {Function} props.onClose hide the panel
 */
export default function WhatIfPanel({ show, result, mode, onModeChange, onClose }) {
  if (!show || !result) return null;
  const { baseline, simulated, delta, matchedCount, remainingActive, reasons } = result;

  const rows = [];
  if (baseline.route) {
    rows.push({
      key: "safety",
      label: "Route safety score",
      before: baseline.route.score,
      after: simulated.route.score,
      delta: delta.safetyScore,
      beforeClass: baseline.route.classification.label,
      afterClass: simulated.route.classification.label,
      beforeColor: baseline.route.classification.color,
      afterColor: simulated.route.classification.color,
    });
  }
  rows.push({
    key: "health",
    label: "Road health index",
    before: baseline.health.index,
    after: simulated.health.index,
    delta: delta.healthIndex,
    beforeClass: baseline.health.grade.label,
    afterClass: simulated.health.grade.label,
    beforeColor: baseline.health.grade.color,
    afterColor: simulated.health.grade.color,
  });

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-50/70 dark:bg-fuchsia-900/20 p-4"
      role="region"
      aria-label="What-if simulation"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-fuchsia-800 dark:text-fuchsia-200 inline-flex items-center gap-2">
          <FlaskConical className="w-4 h-4" aria-hidden="true" /> What-if simulation
        </h3>
        <button onClick={onClose} className="text-xs text-fuchsia-700 dark:text-fuchsia-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-fuchsia-700 dark:text-fuchsia-300">
        {WHAT_IF_LABEL} — a hypothetical "what if these hazards were repaired?" computed by re-running
        the real scoring engines. Not an achieved result, not a schedule, not a promise.
      </div>

      {/* Scenario picker */}
      <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Simulation scenario">
        {WHAT_IF_MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => onModeChange(m.key)}
            aria-pressed={mode === m.key}
            className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
              mode === m.key
                ? "border-fuchsia-600 bg-fuchsia-600 text-white font-bold"
                : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white/70 dark:hover:bg-gray-800"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Before → after */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {rows.map((r) => (
          <div
            key={r.key}
            className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-700 bg-white/70 dark:bg-gray-900/50 p-3"
          >
            <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{r.label}</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="text-center">
                <div className="text-[9px] text-gray-400 uppercase">Before</div>
                <div className="text-xl font-bold" style={{ color: r.beforeColor }}>
                  {r.before ?? "—"}
                </div>
                <div className="text-[9px] text-gray-500">{r.beforeClass}</div>
              </div>
              <div className="text-gray-400 text-lg" aria-hidden="true">
                →
              </div>
              <div className="text-center">
                <div className="text-[9px] text-gray-400 uppercase">After</div>
                <div className="text-xl font-bold" style={{ color: r.afterColor }}>
                  {r.after ?? "—"}
                </div>
                <div className="text-[9px] text-gray-500">{r.afterClass}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[9px] text-gray-400 uppercase">Delta</div>
                <div
                  className="text-sm font-bold"
                  style={{
                    color: r.delta == null ? "#9ca3af" : r.delta > 0 ? "#22c55e" : r.delta < 0 ? "#ef4444" : "#6b7280",
                  }}
                >
                  {r.delta == null ? "—" : `${r.delta > 0 ? "+" : ""}${r.delta}`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Scenario stats */}
      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200 font-medium">
          {matchedCount} hazard{matchedCount === 1 ? "" : "s"} simulated as fixed
        </span>
        <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 font-medium">
          {remainingActive} would remain
        </span>
      </div>

      {/* Why list */}
      <div className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-700 bg-white/70 dark:bg-gray-900/50 p-3">
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
