import React from "react";
import { Wrench } from "lucide-react";
import { PRIORITY_LABEL } from "./repairPriority";
import { hazardTypeMeta } from "../safety/hazardTypes";
import { STATUS_LABELS, STATUS_STYLES, normalizeStatus } from "./hazardLifecycle";

/**
 * Repair priority panel: the active hazards ranked by how urgently they
 * deserve repair.
 *
 * Pure presentational — every score comes from rankRepairs(). It is
 * permanently labelled "Report-based priority" (an ordering of reported
 * hazards, not an official work order), shows why each entry ranks where
 * it does, and points at the location on the map when clicked.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Array} props.ranked output of rankRepairs()
 * @param {Function} props.onClose hide the panel
 * @param {Function} props.onFocus report => void — fly the map to a report
 */
export default function RepairPriorityPanel({ show, ranked, onClose, onFocus }) {
  if (!show || !ranked) return null;

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-900/20 p-4"
      role="region"
      aria-label="Repair priority"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-rose-800 dark:text-rose-200 inline-flex items-center gap-2">
          <Wrench className="w-4 h-4" aria-hidden="true" /> Repair priority
        </h3>
        <button onClick={onClose} className="text-xs text-rose-700 dark:text-rose-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-rose-700 dark:text-rose-300">
        {PRIORITY_LABEL} — active hazards ordered by severity, type criticality, age, confirmation
        status and recurring reports at the spot. An ordering of reported hazards, not an official
        work order or resource plan.
      </div>

      {ranked.length === 0 ? (
        <div className="rounded-xl border border-rose-200 dark:border-rose-700 bg-white/70 dark:bg-gray-900/50 p-4 text-[11px] text-gray-600 dark:text-gray-300">
          No active hazards to rank — everything reported so far is fixed or rejected.
        </div>
      ) : (
        <ol className="space-y-2">
          {ranked.map((entry) => {
            const { rank, report, score, band, reasons, factors, status } = entry;
            const meta = hazardTypeMeta(report.type);
            const st = normalizeStatus(status);
            const stStyle = STATUS_STYLES[st] || STATUS_STYLES.reported;
            const coord = Array.isArray(report.coord) ? report.coord : null;
            return (
              <li
                key={report.id ?? rank}
                className="rounded-xl border border-rose-200 dark:border-rose-700 bg-white/70 dark:bg-gray-900/50 p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    {rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-gray-800 dark:text-gray-100">
                        {meta?.label || report.type || "Hazard"}
                      </span>
                      <span
                        className="px-1 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: stStyle.bg, color: stStyle.text }}
                      >
                        {STATUS_LABELS[st]}
                      </span>
                      <span
                        className="px-1 rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: band.color }}
                        title={reasons.join(" · ")}
                      >
                        {score} · {band.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-300 truncate">
                      {report.description || "(no description)"}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">
                      {coord ? `${coord[1].toFixed(5)}, ${coord[0].toFixed(5)}` : "location unknown"}
                      {factors?.recurrence?.others > 0 ? ` · ${factors.recurrence.others} nearby repeat(s)` : ""}
                      {factors?.age?.available ? ` · age score ${factors.age.score}` : ""}
                    </div>
                    {onFocus && coord && (
                      <button
                        onClick={() => onFocus(report)}
                        className="mt-1 text-[10px] text-rose-700 dark:text-rose-300 underline"
                      >
                        Show on map
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
