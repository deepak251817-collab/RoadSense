import React from "react";
import { CONTRIBUTION_NOTE, DECISION_METHOD } from "./explainability";

/**
 * Explainability card — renders an explanation record produced by
 * utils/explainability.
 *
 * Always discloses which engine produced the output, so rule-based results
 * are never presented as AI, and only ever shows contribution numbers the
 * engine itself computed (no fabricated feature-importance percentages).
 *
 * @param {Object} props
 * @param {Object|null} props.explanation explanation record
 * @param {string} [props.heading] overrides explanation.title
 * @param {boolean} [props.showValue] render the output value + level chip
 * @param {string} [props.className] extra classes for the wrapper
 */
export default function ExplanationCard({
  explanation,
  heading,
  showValue = true,
  className = "",
}) {
  if (!explanation) return null;
  const { title, engineBadge, method, disclosure, value, level, basis, factors, evidence, limitations } =
    explanation;
  const isModel = method === DECISION_METHOD.MODEL;
  const badgeColor = isModel ? "#7c3aed" : "#b45309";
  const hasContribution = factors.some((f) => f.contribution != null);

  return (
    <div
      className={`rounded-xl border p-3 ${
        isModel
          ? "border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-900/20"
          : "border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/20"
      } ${className}`}
      role="group"
      aria-label={`Decision explanation: ${heading || title}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
          {heading || title}
        </div>
        <span
          className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: badgeColor }}
          title={disclosure}
        >
          {engineBadge}
        </span>
      </div>

      <p className="mt-1 text-[10px] leading-snug text-gray-600 dark:text-gray-400">{disclosure}</p>

      {showValue && value != null && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xl font-bold text-gray-800 dark:text-gray-100">{value}</span>
          {level?.label && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: level.color || "#6b7280" }}
            >
              {level.label}
            </span>
          )}
          {basis && (
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
              {basis}
            </span>
          )}
        </div>
      )}

      {/* Factors — engine numbers only */}
      <ul className="mt-2 space-y-1.5">
        {factors.map((f) => (
          <li key={f.key}>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-medium text-gray-700 dark:text-gray-200 truncate">
                {f.label}
                {f.estimated ? " *" : ""}
              </span>
              <span className="shrink-0 text-gray-500 dark:text-gray-400 tabular-nums">
                {f.available ? `risk ${f.risk}` : "no data"}
                {f.contribution != null ? ` · weighted ${f.contribution}` : ""}
              </span>
            </div>
            {f.available ? (
              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 mt-1 overflow-hidden">
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, f.risk))}%`, background: riskColor(f.risk) }}
                />
              </div>
            ) : (
              <div className="h-1.5 rounded-full bg-gray-200/70 dark:bg-gray-700/70 mt-1 border border-dashed border-gray-300 dark:border-gray-600" />
            )}
            <div className="text-[10px] text-gray-500 dark:text-gray-400">{f.directionLabel}</div>
          </li>
        ))}
      </ul>

      {hasContribution && (
        <p className="mt-1 text-[9px] leading-snug text-gray-500 dark:text-gray-400">
          {CONTRIBUTION_NOTE}
        </p>
      )}

      {/* Evidence / confidence */}
      {evidence && (
        <div className="mt-2 pt-2 border-t border-gray-200/70 dark:border-gray-700/70">
          <div
            className="text-[10px] font-bold"
            style={{ color: evidence.color || "#6b7280" }}
            title={`${evidence.availableFactors} of ${evidence.totalFactors} factors had data`}
          >
            Confidence: {evidence.label || "—"}
            {evidence.score != null ? ` (${evidence.score})` : ""}
          </div>
          <ul className="mt-1 space-y-0.5">
            {evidence.reasons.map((r) => (
              <li key={r} className="text-[10px] text-gray-600 dark:text-gray-300">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Honest limitations */}
      {limitations.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {limitations.map((l) => (
            <li key={l} className="text-[10px] text-gray-500 dark:text-gray-400">
              ⚠ {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Display-only color for a 0–100 risk value (mirrors segment-risk palette). */
function riskColor(risk) {
  if (risk >= 70) return "#dc2626";
  if (risk >= 50) return "#ea580c";
  if (risk >= 35) return "#d97706";
  return "#16a34a";
}
