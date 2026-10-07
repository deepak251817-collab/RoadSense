import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { STATUS_STYLES } from "../utils/hazardLifecycle";
import { ANALYTICS_CONFIG } from "../utils/analytics";

/**
 * Safety analytics panel: KPI cards, weekly report trend, lifecycle and
 * severity breakdowns. Pure presentational — all numbers come from
 * computeSafetyAnalytics() (real stored data only).
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object} props.analytics snapshot from computeSafetyAnalytics()
 * @param {Function} props.onClose hide the panel
 */
export default function AnalyticsPanel({ show, analytics, onClose }) {
  if (!show || !analytics) return null;
  const { hazards, lifecycle, trend, trips } = analytics;
  return (
    <div
      className="mt-4 rounded-2xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-900/20 p-4"
      role="region"
      aria-label="Safety analytics"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-teal-800 dark:text-teal-200">Safety analytics</h3>
        <button onClick={onClose} className="text-xs text-teal-700 dark:text-teal-300 underline">
          Hide
        </button>
      </div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {[
          { label: "Active hazards", value: hazards.active, color: "#d97706" },
          { label: "Fixed", value: hazards.fixed, color: "#16a34a" },
          {
            label: "Fix rate",
            value: hazards.fixRate == null ? "—" : `${hazards.fixRate}%`,
            color: "#0f766e",
          },
          {
            label: `Last ${ANALYTICS_CONFIG.recentDays}d reports`,
            value: hazards.recentCount,
            color: "#2563eb",
          },
          { label: "Trips taken", value: trips.tripCount, color: "#7c3aed" },
          { label: "Avg trip safety", value: trips.avgSafety ?? "—", color: "#4f46e5" },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl bg-white dark:bg-gray-900 border border-teal-200 dark:border-teal-800 px-3 py-2"
          >
            <div className="text-lg font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {k.label}
            </div>
          </div>
        ))}
      </div>
      {/* Evidence base for the metrics above */}
      <div className="-mt-1 mb-3 text-[10px] text-gray-500 dark:text-gray-400">
        Evidence base: {hazards.total} stored report{hazards.total === 1 ? "" : "s"} ·{" "}
        {trips.scoredCount ?? 0} of {trips.tripCount} trips safety-scored
      </div>
      {/* Weekly report trend */}
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-teal-200 dark:border-teal-800 p-3 mb-3">
        <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
          Reports per week (last 8 weeks)
        </div>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Lifecycle + severity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Hazard lifecycle
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lifecycle.map((l) => {
              const sty = STATUS_STYLES[l.status] || STATUS_STYLES.reported;
              return (
                <span
                  key={l.status}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: sty.bg, color: sty.text }}
                  title={`${l.label}: ${l.count}`}
                >
                  {l.label}: {l.count}
                </span>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Severity mix (all reports)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "High", value: hazards.severity.high, color: "#dc2626" },
              { label: "Moderate", value: hazards.severity.moderate, color: "#d97706" },
              { label: "Low", value: hazards.severity.low, color: "#16a34a" },
              { label: "Other", value: hazards.severity.other, color: "#6b7280" },
            ].map((s) => (
              <span
                key={s.label}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: s.color }}
              >
                {s.label}: {s.value}
              </span>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
            Totals are derived only from your stored reports and trips.
          </div>
        </div>
      </div>
    </div>
  );
}
