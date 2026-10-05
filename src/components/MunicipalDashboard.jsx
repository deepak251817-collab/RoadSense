import React from "react";
import { Building2 } from "lucide-react";
import { MUNICIPAL_LABEL } from "../utils/municipalSummary";
import { PRIORITY_LABEL } from "../utils/repairPriority";
import { CHANGE_LABEL } from "../utils/changeDetection";
import { hazardTypeMeta } from "../utils/hazardTypes";

/**
 * Municipal dashboard (admin-only): one overview of the local hazard
 * database — KPIs, active hazard mix, lifecycle queue, top repair
 * priorities, road health and trend vs baseline.
 *
 * Pure presentational: every number comes from summarizeMunicipal(),
 * which only aggregates reports stored in this browser. Permanently
 * labelled "Report-based summary" — not a municipal system connection,
 * not official statistics, not a prediction.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object|null} props.summary output of summarizeMunicipal()
 * @param {Function} props.onClose hide the panel
 * @param {Function} props.onFocus report => void — fly the map to a report
 */
export default function MunicipalDashboard({ show, summary, onClose, onFocus }) {
  if (!show || !summary) return null;
  const { kpi, byType, lifecycle, topPriorities, trend, reasons } = summary;
  const maxType = byType.reduce((m, t) => Math.max(m, t.count), 0) || 1;

  const kpis = [
    { label: "Total reports", value: kpi.total, color: "#374151" },
    { label: "Active hazards", value: kpi.active, color: "#f97316" },
    { label: "High/critical", value: kpi.highActive, color: kpi.highActive > 0 ? "#ef4444" : "#22c55e" },
    { label: "Fixed", value: kpi.fixed, color: "#22c55e" },
    {
      label: "Repair rate",
      value: kpi.repairRate == null ? "—" : `${kpi.repairRate}%`,
      color: kpi.repairRate == null ? "#9ca3af" : kpi.repairRate >= 50 ? "#22c55e" : "#eab308",
    },
    {
      label: "Health index",
      value: kpi.healthIndex == null ? "—" : kpi.healthIndex,
      color: kpi.healthGrade.color,
    },
  ];

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/30 p-4"
      role="region"
      aria-label="Municipal dashboard"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2">
          <Building2 className="w-4 h-4" aria-hidden="true" /> Municipal dashboard
        </h3>
        <button onClick={onClose} className="text-xs text-slate-700 dark:text-slate-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-slate-700 dark:text-slate-300">
        {MUNICIPAL_LABEL} — aggregated from reports stored locally in this browser. Not connected to
        any municipal system, not official statistics, not a prediction.
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-2 text-center"
          >
            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{k.label}</div>
            <div className="text-lg font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {/* Active hazard mix */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3">
          <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1.5">
            Active hazards by type
          </div>
          {byType.length === 0 ? (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">No active hazards.</div>
          ) : (
            <ul className="space-y-1">
              {byType.map((t) => (
                <li key={t.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-28 shrink-0 text-gray-700 dark:text-gray-200 truncate">
                    {hazardTypeMeta(t.key).label}
                  </span>
                  <span className="flex-1 h-2 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <span
                      className="block h-full rounded"
                      style={{
                        width: `${Math.max(8, Math.round((t.count / maxType) * 100))}%`,
                        backgroundColor: t.high > 0 ? "#f97316" : "#eab308",
                      }}
                    />
                  </span>
                  <span className="w-10 text-right font-semibold text-gray-600 dark:text-gray-300">
                    {t.count}
                  </span>
                  {t.high > 0 && (
                    <span className="text-[9px] font-bold text-red-600 dark:text-red-400">
                      {t.high} hi
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lifecycle queue */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3">
          <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1.5">
            Lifecycle queue
          </div>
          {lifecycle.length === 0 ? (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">No reports yet.</div>
          ) : (
            <ul className="space-y-1 text-[11px]">
              {lifecycle.map((l) => (
                <li key={l.status} className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-200">{l.label}</span>
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{l.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Top repair priorities */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3 mb-3">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1.5">
          Top repair priorities <span className="font-normal text-gray-500">({PRIORITY_LABEL})</span>
        </div>
        {topPriorities.length === 0 ? (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            No active hazards to prioritize.
          </div>
        ) : (
          <ol className="space-y-1">
            {topPriorities.map((e) => (
              <li key={e.report.id ?? e.rank} className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-4 h-4 rounded-full text-[9px] font-bold text-white inline-flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: e.band.color }}
                >
                  {e.rank}
                </span>
                <span className="text-gray-700 dark:text-gray-200 truncate flex-1">
                  {hazardTypeMeta(e.report.type).label}
                  {e.report.description ? ` — ${e.report.description}` : ""}
                </span>
                <span className="font-semibold" style={{ color: e.band.color }}>
                  {e.score}
                </span>
                {onFocus && Array.isArray(e.report.coord) && (
                  <button
                    onClick={() => onFocus(e.report)}
                    className="text-[10px] text-slate-600 dark:text-slate-300 underline flex-shrink-0"
                  >
                    map
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Trend */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3 mb-3">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1">
          Trend <span className="font-normal text-gray-500">({CHANGE_LABEL})</span>
        </div>
        {trend.insufficientHistory ? (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">{trend.reason}</div>
        ) : (
          <div className="text-[11px] text-gray-600 dark:text-gray-300">
            <span
              className="font-bold"
              style={{
                color:
                  trend.direction === "improved"
                    ? "#22c55e"
                    : trend.direction === "worsened"
                      ? "#ef4444"
                      : "#6b7280",
              }}
            >
              {trend.directionLabel}
            </span>{" "}
            since {new Date(trend.baseline.at).toLocaleDateString()} — {trend.newCount} new,{" "}
            {trend.resolvedCount} fixed
            {trend.healthDelta != null ? `, health ${trend.healthDelta > 0 ? "+" : ""}${trend.healthDelta}` : ""}
          </div>
        )}
      </div>

      {/* Why list */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3">
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
