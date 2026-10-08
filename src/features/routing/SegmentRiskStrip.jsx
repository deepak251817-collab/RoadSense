import React, { useState } from "react";

/**
 * Segment risk display: a colored strip of the selected route's segments
 * plus an expandable detail card. Pure presentational — all data comes from
 * analyzeRouteSegments() (real reports/incidents/weather/traffic only).
 *
 * @param {Object} props
 * @param {boolean} props.show visibility
 * @param {Array} props.segments analyses from analyzeRouteSegments()
 * @param {Function} props.onClose hide the panel
 */
export default function SegmentRiskStrip({ show, segments, onClose }) {
  const [selected, setSelected] = useState(null);

  if (!show || !segments || !segments.length) return null;
  const detail = selected != null ? segments.find((s) => s.index === selected) : null;

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20 p-4"
      role="region"
      aria-label="Road segment risk"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          Road segment risk
        </h3>
        <button onClick={onClose} className="text-xs text-emerald-700 dark:text-emerald-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-2 text-[11px] text-emerald-700 dark:text-emerald-300">
        {segments.length} segments · click a segment for score, hazards, traffic, weather and
        explanation
      </div>

      {/* Colored strip: green → yellow → orange → red */}
      <div className="flex gap-1 mb-2" role="list" aria-label="Route segments by risk">
        {segments.map((s) => (
          <button
            key={s.index}
            role="listitem"
            onClick={() => setSelected(selected === s.index ? null : s.index)}
            aria-label={`Segment ${s.index + 1}: ${s.band.label}, score ${s.score}`}
            aria-pressed={selected === s.index}
            className={`flex-1 h-8 rounded-md text-[10px] font-bold text-white shadow-sm transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 ${selected === s.index ? "ring-2 ring-gray-900/70 scale-105" : ""}`}
            style={{ backgroundColor: s.band.color }}
            title={`Segment ${s.index + 1}: ${s.band.label} (${s.score})`}
          >
            {s.score}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-2 text-[10px] text-gray-600 dark:text-gray-300">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle" style={{ background: "#22c55e" }} /> Safe</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle" style={{ background: "#eab308" }} /> Moderate</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle" style={{ background: "#f97316" }} /> Risky</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle" style={{ background: "#ef4444" }} /> High Risk</span>
      </div>

      {/* Detail card */}
      {detail ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white/80 dark:bg-gray-900/60 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-bold text-gray-800 dark:text-gray-100">
              Segment {detail.index + 1} · {Math.round(detail.lengthMeters)} m
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: detail.band.color }}
            >
              {detail.score} — {detail.band.label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-600 dark:text-gray-300 mb-1">
            <span> Traffic: {detail.traffic.available ? detail.traffic.risk : "—"}{detail.traffic.estimated ? " (est.)" : ""}</span>
            <span> Weather: {detail.weather.available ? `${detail.weather.risk} — ${detail.weather.condition}` : "—"}</span>
            <span> Hazards nearby: {detail.hazards.reports.length}</span>
            <span> Incidents: {detail.hazards.incidents.length}</span>
            <span> Confidence: {detail.confidence.label}</span>
            <span> Distance: {detail.startMeters}–{detail.endMeters} m</span>
          </div>
          <ul className="space-y-0.5">
            {detail.explanation.map((line) => (
              <li key={line} className="text-[11px] text-gray-600 dark:text-gray-300">
                • {line}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          Select a segment above for details.
        </div>
      )}
    </div>
  );
}
