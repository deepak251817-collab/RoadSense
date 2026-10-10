/**
 * STARS explainable decision layer.
 *
 * Produces ONE model-agnostic explanation record for any intelligence output
 * the app generates (safety score, predictive estimate, road health, repair
 * priority, what-if scenario, ...), so every decision surfaced to the user
 * carries the same honest metadata:
 *
 *   - which engine produced it (rule-based vs a registered ML model)
 *   - the factors that actually drove it, with the engine's own numbers
 *   - the evidence/confidence behind it
 *   - explicit limitations
 *
 * HONESTY CONTRACT
 * ----------------
 * 1. STARS ships no trained model. Until a real inference backend is
 *    registered through registerInferenceModel(), every explanation reports
 *    `hasRealModel: false`, `method: "rule-based"` and a disclosure that
 *    states the result is deterministic — never "AI".
 * 2. Contribution percentages are surfaced ONLY when the producing engine
 *    actually computed them (e.g. the weighted-risk share from safetyScore).
 *    This layer never synthesises feature-importance numbers, confidences or
 *    statistics.
 * 3. Factors with no data are reported as `no-data` with NO contribution, so
 *    missing inputs are never disguised as small-but-real ones.
 *
 * The registry is a real extension point: a future YOLO / ONNX / remote
 * inference adapter registers itself here and explanations then switch to
 * `method: "model"` automatically.
 */

/** How an output was produced. */
export const DECISION_METHOD = {
  RULE: "rule-based",
  MODEL: "model",
};

/** Engine badges shown to the user. */
const ENGINE_LABELS = {
  rule: "Rule-based decision engine",
  model: "Registered AI model",
};

/** Short badge used in headers/panels. */
const ENGINE_BADGES = {
  rule: "Rule-based engine · no ML model",
  model: "AI model",
};

/**
 * Display-only meaning of a factor's direction. Derived from the engine's
 * own risk value for that factor — it is a description of the input, not a
 * model attribution.
 */
const DIRECTION_LABELS = {
  "increases-risk": "Raises risk",
  neutral: "No effect on risk",
  "no-data": "No data — excluded from the result",
};

/** Plain-language definition of the engine's contribution figure. */
export const CONTRIBUTION_NOTE =
  "Weighted contribution is the scoring engine's own figure (factor weight × risk, " +
  "normalized by the total weight of available factors, on the 0–100 scale). It is not " +
  "a model feature-importance percentage and contributions do not sum to 100.";

/** Disclosure used whenever no real model produced the output. */
const RULE_BASED_DISCLOSURE =
  "Computed by a deterministic rule-based engine from the inputs listed below. " +
  "No machine-learning model produced this result, so no model confidence or " +
  "feature-importance values are shown.";

/** Disclosure used once a real model has been registered. */
function modelDisclosure(model) {
  const version = model?.version ? ` v${model.version}` : "";
  const kind = model?.kind && model.kind !== "ai" ? ` (${model.kind})` : "";
  return `Computed by the registered inference model "${model?.name ?? "unknown"}"${version}${kind}. ` +
    `Confidence and factor values below come from that model's output.`;
}

/* ------------------------------------------------------------------ *
 * Model registry — the extension point for real inference backends.
 * ------------------------------------------------------------------ */

/** @type {null|{name:string, version:string|null, kind:string, infer:Function|null}} */
let activeModel = null;

/**
 * Register a real inference model (YOLO / ONNX Runtime / TensorFlow.js /
 * remote inference API). Only after this call does STARS report an
 * AI-produced result anywhere.
 *
 * @param {{name:string, version?:string, kind?:string, infer?:Function}} model
 * @returns {{name:string, version:string|null, kind:string, infer:Function|null}}
 * @throws {TypeError} when the descriptor is malformed
 */
function registerInferenceModel(model) {
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    throw new TypeError("registerInferenceModel: expected a model descriptor object");
  }
  const name = typeof model.name === "string" ? model.name.trim() : "";
  if (!name) {
    throw new TypeError("registerInferenceModel: model.name must be a non-empty string");
  }
  if (model.infer != null && typeof model.infer !== "function") {
    throw new TypeError("registerInferenceModel: model.infer must be a function when provided");
  }
  activeModel = {
    name,
    version: model.version != null && String(model.version).trim() ? String(model.version).trim() : null,
    kind: typeof model.kind === "string" && model.kind.trim() ? model.kind.trim() : "ai",
    infer: model.infer ?? null,
  };
  return getInferenceModel();
}

/** Copy of the registered model descriptor (null when none is registered). */
function getInferenceModel() {
  if (!activeModel) return null;
  return {
    name: activeModel.name,
    version: activeModel.version,
    kind: activeModel.kind,
    infer: activeModel.infer,
  };
}

/** True only when a genuine inference backend is registered. */
function hasRealModel() {
  return activeModel != null;
}

/** Short human badge for the active engine. */
export function describeEngine(model) {
  const active = model === undefined ? getInferenceModel() : model;
  if (!active) return ENGINE_BADGES.rule;
  return `${ENGINE_BADGES.model}: ${active.name}${active.version ? ` v${active.version}` : ""}`;
}

/* ------------------------------------------------------------------ *
 * Factor normalization
 * ------------------------------------------------------------------ */

/**
 * Normalize one engine factor into the shared explanation shape.
 * `contribution` is copied through only when the engine actually produced it.
 *
 * @param {string} key
 * @param {Object} raw
 * @returns {Object|null}
 */
function normalizeFactorEntry(key, raw) {
  if (!raw || typeof raw !== "object") return null;
  const risk = Number.isFinite(raw.risk) ? raw.risk : null;
  const available = raw.available != null ? Boolean(raw.available) && risk != null : risk != null;
  const direction = !available ? "no-data" : risk > 0 ? "increases-risk" : "neutral";

  return {
    key: String(key),
    label: typeof raw.label === "string" && raw.label ? raw.label : String(key),
    risk: available ? risk : null,
    weight: Number.isFinite(raw.weight) ? raw.weight : undefined,
    // Only trust a contribution the engine computed for an available factor.
    contribution:
      available && Number.isFinite(raw.contribution) ? raw.contribution : undefined,
    available,
    estimated: Boolean(raw.estimated),
    changed: Boolean(raw.changed),
    direction,
    directionLabel: DIRECTION_LABELS[direction],
    summary: summarizeFactor(
      typeof raw.label === "string" && raw.label ? raw.label : String(key),
      available ? risk : null,
      available && Number.isFinite(raw.contribution) ? raw.contribution : undefined,
      Boolean(raw.estimated),
      available
    ),
  };
}

/**
 * One factual sentence per factor — no inference beyond the engine numbers.
 * `contribution` is the scoring engine's weighted-risk figure (weight × risk
 * ÷ total weight of available factors, on the same 0–100 scale); it is NOT a
 * share of a whole and NOT a model feature-importance percentage.
 */
function summarizeFactor(label, risk, contribution, estimated, available) {
  if (!available) return `${label}: no data available — excluded from the result.`;
  const est = estimated ? " (estimated input)" : "";
  const contrib = contribution != null ? `, weighted contribution ${contribution}/100` : "";
  return `${label}: risk ${risk}/100${est}${contrib}.`;
}

/**
 * Accepts an engine factor map ({key: {...}}) or an array of factor records.
 * @returns {Array<Object>}
 */
function normalizeFactors(factors) {
  if (Array.isArray(factors)) {
    return factors
      .map((f, i) => normalizeFactorEntry(f?.key ?? f?.label ?? i, f))
      .filter(Boolean);
  }
  if (factors && typeof factors === "object") {
    return Object.entries(factors).map(([k, v]) => normalizeFactorEntry(k, v)).filter(Boolean);
  }
  return [];
}

/* ------------------------------------------------------------------ *
 * Explanation builder
 * ------------------------------------------------------------------ */

/**
 * Build a model-agnostic explanation record.
 *
 * @param {Object} input
 * @param {string} [input.title]        what is being explained
 * @param {number|null} [input.value]   the output value (e.g. 0..100 score)
 * @param {Object|null} [input.level]   classification {label, color}
 * @param {string|null} [input.basis]   e.g. "Predictive estimate"
 * @param {Object|Array} [input.factors] raw engine factors
 * @param {Object|null} [input.confidence] engine confidence record
 * @param {Object|null|undefined} [input.model] model override;
 *   undefined → use the registry, null → force rule-based
 * @returns {Object} explanation record
 */
function buildExplanation({
  title = "Decision",
  value = null,
  level = null,
  basis = null,
  factors = {},
  confidence = null,
  model = undefined,
} = {}) {
  const active = model === undefined ? getInferenceModel() : model;
  const method = active ? DECISION_METHOD.MODEL : DECISION_METHOD.RULE;
  const factorList = normalizeFactors(factors);

  const evidence = confidence
    ? {
        label: confidence.label ?? null,
        color: confidence.color ?? null,
        score: Number.isFinite(confidence.score) ? confidence.score : null,
        reasons: Array.isArray(confidence.reasons) ? confidence.reasons.slice() : [],
        availableFactors: Number.isFinite(confidence.availableFactors)
          ? confidence.availableFactors
          : factorList.filter((f) => f.available).length,
        totalFactors: Number.isFinite(confidence.totalFactors)
          ? confidence.totalFactors
          : factorList.length,
      }
    : null;

  const missing = factorList.filter((f) => !f.available).length;
  const limitations = [];
  if (!active) {
    limitations.push(
      "No machine-learning model is registered for this output — the result is deterministic for identical inputs."
    );
  }
  if (missing > 0 && factorList.length > 0) {
    limitations.push(
      `${missing} of ${factorList.length} factors had no data and were excluded rather than estimated.`
    );
  }
  if (basis === "Predictive estimate") {
    limitations.push(
      "A predictive estimate extrapolates current conditions; it is not an observation."
    );
  }

  return {
    title,
    value: Number.isFinite(value) ? value : null,
    level: level ?? null,
    basis,
    method,
    engineLabel: active
      ? `${ENGINE_LABELS.model}: ${active.name}${active.version ? ` v${active.version}` : ""}`
      : ENGINE_LABELS.rule,
    engineBadge: describeEngine(active ?? null),
    model: active ? { name: active.name, version: active.version, kind: active.kind } : null,
    hasRealModel: Boolean(active),
    disclosure: active ? modelDisclosure(active) : RULE_BASED_DISCLOSURE,
    factors: factorList,
    evidence,
    limitations,
  };
}

/**
 * Explain a calculateRoadSafetyScore() result.
 *
 * @param {Object} result engine output
 * @param {Object} [opts] {title, basis, model}
 * @returns {Object|null}
 */
export function explainSafetyScore(result, opts = {}) {
  if (!result || typeof result !== "object") return null;
  return buildExplanation({
    title: opts.title ?? "Road safety score",
    value: result.score,
    level: result.classification ?? null,
    basis: opts.basis ?? "Current conditions",
    factors: result.factors ?? {},
    confidence: result.confidence ?? null,
    model: opts.model,
  });
}

/**
 * Explain a predictRoadRisk() result. Always carries the "Predictive
 * estimate" basis so extrapolations are never read as live observations.
 *
 * @param {Object} prediction engine output
 * @param {Object} [opts] {title, basis, model}
 * @returns {Object|null}
 */
export function explainPrediction(prediction, opts = {}) {
  if (!prediction || typeof prediction !== "object") return null;
  const horizon = Number.isFinite(prediction.horizonMinutes)
    ? ` — ${prediction.horizonMinutes} min`
    : "";
  return buildExplanation({
    title: opts.title ?? `Predicted safety${horizon}`,
    value: prediction.predictedScore,
    level: prediction.riskLevel ?? null,
    basis: opts.basis ?? "Predictive estimate",
    factors: prediction.factors ?? {},
    confidence: prediction.confidence ?? null,
    model: opts.model,
  });
}
