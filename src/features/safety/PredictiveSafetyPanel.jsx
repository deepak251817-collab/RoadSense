import React, { memo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { PREDICTION_LABEL } from "./prediction";
import { describeEngine, explainPrediction, explainSafetyScore } from "./explainability";
import ExplanationCard from "./ExplanationCard";

/**
 * Predictive safety panel: current + 15/30/60-minute road-risk estimates.
 *
 * Pure presentational — every number comes from predictRoadRisk() (rule-based
 * estimate over real current conditions). The panel is permanently labelled
 * "Predictive estimate" so simulated/estimated output is never mistaken for
 * a live observation or a guaranteed forecast.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {{current:Object, horizons:Array}|null} props.prediction engine output
 * @param {Function} props.onClose hide the panel
 */
function PredictiveSafetyPanel({ show, prediction, onClose }) {
  // Hook must run unconditionally — keep it above the early return.
  const [showExplanation, setShowExplanation] = useState(false);

  if (!show || !prediction) return null;
  const { current, horizons } = prediction;

  const cards = [
    {
      key: "now",
      title: "Current safety",
      score: current.score,
      level: current.classification,
      confidence: current.confidence,
      factors: current.factors,
      isNow: true,
    },
    ...horizons.map((h) => ({
      key: `+${h.horizonMinutes}`,
      title: `Predicted — ${h.horizonMinutes} min`,
      score: h.predictedScore,
      level: h.riskLevel,
      confidence: h.confidence,
      factors: h.factors,
      isNow: false,
    })),
  ];

  // Top contributing risk factors (available data only, highest risk first)
  const topFactors = (factors, n = 2) =>
    Object.values(factors)
      .filter((f) => f.available && f.risk != null && f.risk > 0)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, n);

  const chartData = cards.map((c) => ({
    name: c.title.replace("Predicted — ", "+").replace("Current safety", "Now"),
    score: c.score,
  }));

  // Explanation comes from the furthest horizon (the most speculative view)
  const last = horizons[horizons.length - 1];

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-900/20 p-4"
      role="region"
      aria-label="Predictive safety"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200">
          Predictive safety
        </h3>
        <button onClick={onClose} className="text-xs text-violet-700 dark:text-violet-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 text-[11px] text-violet-700 dark:text-violet-300">
        {PREDICTION_LABEL} — rule-based estimate from current conditions, time of day and any
        available forecast. Not a real-time observation or guaranteed outcome.{" "}
        <span className="font-semibold">Engine: {describeEngine()}.</span>
      </div>

      {/* Horizon cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`rounded-xl border p-3 ${
              c.isNow
                ? "border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60"
                : "border-violet-200 dark:border-violet-700 bg-white/60 dark:bg-gray-900/50"
            }`}
          >
            <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              {c.title}
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold" style={{ color: c.level.color }}>
                {c.score}
              </span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: c.level.color }}
              >
                {c.level.label}
              </span>
            </div>
            <div
              className="text-[10px] font-semibold mt-1"
              style={{ color: c.confidence.color }}
              title={c.confidence.reasons?.join(" · ")}
            >
              Confidence: {c.confidence.label}
            </div>
            <ul className="mt-1 space-y-0.5">
              {topFactors(c.factors).map((f) => (
                <li key={f.label} className="text-[10px] text-gray-600 dark:text-gray-300 truncate">
                  {f.label}: {f.risk}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Compact visualization */}
      <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-white/70 dark:bg-gray-900/50 p-2 mb-3">
        <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
          Safety score across horizons
        </div>
        <div style={{ width: "100%", height: 130 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [`${v}`, "Safety score"]} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={{ r: 3, fill: "#7c3aed" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Explanation for the furthest horizon */}
      <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-white/70 dark:bg-gray-900/50 p-3">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-1">
          Why — {last.horizonMinutes}-minute estimate
        </div>
        <ul className="space-y-0.5">
          {last.confidence.reasons.map((r) => (
            <li key={r} className="text-[11px] text-gray-600 dark:text-gray-300">
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Explainable decision layer — full factor breakdown on demand */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowExplanation((v) => !v)}
          aria-expanded={showExplanation}
          className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 underline"
        >
          {showExplanation ? "Hide decision breakdown" : "How was this decided?"}
        </button>
        {showExplanation && (
          <>
            <ExplanationCard
              explanation={explainSafetyScore(current)}
              heading="Current safety score — why"
              className="mt-2"
            />
            <ExplanationCard
              explanation={explainPrediction(last)}
              heading={`${last.horizonMinutes}-minute estimate — why`}
              showValue={false}
              className="mt-2"
            />
          </>
        )}
      </div>
    </div>
  );
}

export default memo(PredictiveSafetyPanel);
