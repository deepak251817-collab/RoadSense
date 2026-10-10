import React from "react";
import { Building2 } from "lucide-react";
import { MUNICIPAL_LABEL, MUNICIPAL_FILTERS } from "./municipalSummary";
import { normalizeStatus } from "./hazardLifecycle";
import { PRIORITY_LABEL } from "./repairPriority";
import { CHANGE_LABEL } from "../road-conditions/changeDetection";
import { hazardTypeMeta } from "../safety/hazardTypes";

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
export default function MunicipalDashboard({ show, summary, reports = [], filters = {}, onFiltersChange, locationChoices = [], totalReports, onClose, onFocus }) {
  if (!show || !summary) return null;
  const { kpi, byType, lifecycle, topPriorities, critical, areas, trend, reasons, health } = summary;
  const byTypeCount = (key) => byType.find((t) => t.key === key)?.count || 0;
  const verifiedCount = lifecycle.find((l) => l.status === "verified")?.count || 0;
  const recentFixed = (Array.isArray(reports) ? reports : [])
    .filter((r) => normalizeStatus(r.status) === "fixed")
    .sort((a, b) => Number(b.reviewedAt || b.createdAt || 0) - Number(a.reviewedAt || a.createdAt || 0))
    .slice(0, 3);
  const filterActive = Object.values(filters).some((v) => v && v !== "all");
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

      {/* Filters: date, severity, type, status, priority (spec Phase 23) */}
      <div className="mb-3 flex flex-wrap items-end gap-2" role="group" aria-label="Dashboard filters">
        {[
          ["date", "Date"],
          ["severity", "Severity"],
          ["type", "Type"],
          ["status", "Status"],
          ["priority", "Priority"],
          ["location", "Location"],
        ].map(([key, labelText]) => (
          <label key={key} className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
            {labelText}
            <select
              value={filters[key] ?? "all"}
              onChange={(e) => onFiltersChange && onFiltersChange({ ...filters, [key]: e.target.value })}
              className="ml-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-900 px-1.5 py-1 text-[11px] font-normal text-gray-800 dark:text-gray-200"
            >
              {(key === "location" ? locationChoices : MUNICIPAL_FILTERS[key] || []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {filterActive && (
          <button
            onClick={() =>
              onFiltersChange &&
              onFiltersChange({ date: "all", severity: "all", type: "all", status: "all", priority: "all", location: "all" })
            }
            className="text-[10px] text-slate-600 dark:text-slate-300 underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400">
          Showing {kpi.total} of {totalReports ?? kpi.total} reports
        </span>
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
            <div className="stars-empty">No reports yet.</div>
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

      {/* Critical roads — active high/critical hazards by area (spec Phase 23) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3 mb-3">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1.5">
          Critical roads <span className="font-normal text-gray-500">(active high/critical hazards)</span>
        </div>
        {!critical || critical.length === 0 ? (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">No active high or critical hazards.</div>
        ) : (
          <ul className="space-y-1">
            {critical.slice(0, 6).map((c) => (
              <li key={c.report.id} className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.sev === "critical" ? "#dc2626" : "#f97316" }}
                  aria-hidden="true"
                />
                <span className="text-gray-700 dark:text-gray-200 truncate flex-1">
                  {hazardTypeMeta(c.report.type).label} — {c.area}
                </span>
                <span className="text-[9px] font-bold uppercase text-red-600 dark:text-red-400">{c.sev}</span>
                {onFocus && (
                  <button
                    onClick={() => onFocus(c.report)}
                    className="text-[10px] text-slate-600 dark:text-slate-300 underline flex-shrink-0"
                  >
                    map
                  </button>
                )}
              </li>
            ))}
            {critical.length > 6 && (
              <li className="text-[10px] text-gray-500 dark:text-gray-400">+{critical.length - 6} more</li>
            )}
          </ul>
        )}
      </div>

      {/* Deteriorating roads vs baseline (spec Phase 23) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3 mb-3">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1.5">
          Road condition change <span className="font-normal text-gray-500">({areas?.label ?? CHANGE_LABEL})</span>
        </div>
        {areas?.insufficientHistory ? (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">{areas.reason}</div>
        ) : !areas || areas.items.length === 0 ? (
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            No new or resolved hazards since the baseline snapshot.
          </div>
        ) : (
          <ul className="space-y-1">
            {areas.items.slice(0, 6).map((a) => (
              <li key={a.cell} className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-16 shrink-0 text-[9px] font-bold uppercase"
                  style={{
                    color:
                      a.direction === "deteriorating" ? "#ef4444" : a.direction === "improving" ? "#16a34a" : "#6b7280",
                  }}
                >
                  {a.direction}
                </span>
                <span className="text-gray-700 dark:text-gray-200 truncate flex-1">{a.area}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  +{a.newHazards} new · {a.resolvedHazards} resolved
                </span>
              </li>
            ))}
            {areas.items.length > 6 && (
              <li className="text-[10px] text-gray-500 dark:text-gray-400">+{areas.items.length - 6} more areas</li>
            )}
          </ul>
        )}
      </div>

      {/* Road health + coverage sections (spec Phase 23) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3">
          <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1">Road Health</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold" style={{ color: health?.grade?.color }}>
              {health?.index ?? "—"}
            </span>
            <span className="text-[11px] font-semibold" style={{ color: health?.grade?.color }}>
              {health?.grade?.label ?? "—"}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">Long-term condition from stored reports and repairs.</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/60 p-3">
          <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1">
            Hazards &amp; activity
          </div>
          <ul className="space-y-0.5 text-[11px] text-gray-600 dark:text-gray-300">
            <li>Potholes (active): <span className="font-semibold">{byTypeCount("pothole")}</span></li>
            <li>Waterlogging (active): <span className="font-semibold">{byTypeCount("waterlogging")}</span></li>
            <li>Verified hazards: <span className="font-semibold">{verifiedCount}</span></li>
            <li>
              Recently fixed:{" "}
              {recentFixed.length === 0 ? (
                <span className="text-gray-400">none yet</span>
              ) : (
                recentFixed
                  .map(
                    (r) =>
                      `${hazardTypeMeta(r.type).label} (${new Date(r.reviewedAt || r.createdAt).toLocaleDateString()})`
                  )
                  .join(", ")
              )}
            </li>
          </ul>
        </div>
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
