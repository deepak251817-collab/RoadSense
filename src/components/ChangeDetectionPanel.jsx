import React from "react";
import { GitCompareArrows } from "lucide-react";
import { CHANGE_LABEL } from "../utils/changeDetection";

/**
 * Change detection panel: what changed in the hazard database since the
 * stored baseline snapshot.
 *
 * Pure presentational — every number comes from detectChanges(). The
 * insufficient-history guard renders as an explicit "not enough history"
 * card instead of fabricated deltas, count-based fallbacks are flagged,
 * and the panel is permanently labelled "Report-based comparison".
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object|null} props.changes output of detectChanges()
 * @param {Function} props.onClose hide the panel
 */
export default function ChangeDetectionPanel({ show, changes, onClose }) {
  if (!show || !changes) return null;

  const directionColor =
    changes.direction === "improved" ? "#22c55e" : changes.direction === "worsened" ? "#ef4444" : "#6b7280";

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 p-4"
      role="region"
      aria-label="Change detection"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 inline-flex items-center gap-2">
          <GitCompareArrows className="w-4 h-4" aria-hidden="true" /> Change detection
        </h3>
        <button onClick={onClose} className="text-xs text-amber-700 dark:text-amber-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-amber-700 dark:text-amber-300">
        {CHANGE_LABEL} — differences between the live report database and the stored baseline
        snapshot. Not sensor data and not a prediction.
      </div>

      {changes.insufficientHistory ? (
        /* ---- Insufficient-history guard: honest empty state ---- */
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-white/70 dark:bg-gray-900/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              Insufficient history
            </span>
          </div>
          <div className="text-[11px] text-gray-600 dark:text-gray-300">{changes.reason}</div>
        </div>
      ) : (
        <>
          {/* Direction + delta cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-white/70 dark:bg-gray-900/50 p-3">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Since baseline</div>
              <div className="text-lg font-bold mt-0.5" style={{ color: directionColor }}>
                {changes.directionLabel}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {new Date(changes.baseline.at).toLocaleDateString()}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-white/70 dark:bg-gray-900/50 p-3">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">New hazards</div>
              <div className="text-lg font-bold mt-0.5 text-orange-600 dark:text-orange-400">
                +{changes.newCount}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">since baseline</div>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-white/70 dark:bg-gray-900/50 p-3">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Fixed</div>
              <div className="text-lg font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">
                {changes.resolvedCount}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">since baseline</div>
            </div>
            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-white/70 dark:bg-gray-900/50 p-3">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Health index</div>
              <div className="text-lg font-bold mt-0.5" style={{ color: directionColor }}>
                {changes.healthDelta == null
                  ? "—"
                  : `${changes.healthDelta > 0 ? "+" : ""}${changes.healthDelta}`}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {changes.baseline.healthIndex ?? "—"} → {changes.current.healthIndex ?? "—"}
              </div>
            </div>
          </div>

          {changes.countsOnly && (
            <div className="mb-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-100/70 dark:bg-amber-900/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
              ⚠ Baseline lacks report IDs — deltas are count-based only.
            </div>
          )}

          {/* Why list */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-white/70 dark:bg-gray-900/50 p-3">
            <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1">Why</div>
            <ul className="space-y-0.5">
              {changes.reasons.map((r) => (
                <li key={r} className="text-[11px] text-gray-600 dark:text-gray-300">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
