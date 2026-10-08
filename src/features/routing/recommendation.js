/**
 * Safety-aware route recommendation.
 *
 * Chooses a route by blending safety and travel time with configurable
 * per-mode weights (Safety First 70/30, Balanced 50/50, Time First 30/70):
 * a slower-but-safer route wins exactly when the weighted blend says so.
 * Purely deterministic — no randomness, no fabricated inputs.
 */

/**
 * Safety-vs-time decision weights per priority mode (spec: Safety First
 * 70% safety / 30% time, Balanced 50/50, Time First 30% safety / 70% time).
 * The time weight applies to a normalized travel-time score where the
 * fastest route = 100 and slower routes score proportionally less.
 */
export const PRIORITY_WEIGHTS = {
  safest: { safety: 0.7, time: 0.3 },
  balanced: { safety: 0.5, time: 0.5 },
  fastest: { safety: 0.3, time: 0.7 },
};

/** Configurable recommendation policy (defaults to Balanced 50/50). */
export const DEFAULT_RECOMMENDATION_CONFIG = {
  weights: { safety: 0.5, time: 0.5 },
};

/**
 * Recommend one route from analysis records produced by utils/routeAnalysis.
 *
 * @param {Array<Object>} analyses per-route analyses (score, durations, ...)
 * @param {Object} [config] override of DEFAULT_RECOMMENDATION_CONFIG
 * @returns {null | {
 *   recommendedIndex:number, fastestIndex:number, isFastest:boolean,
 *   safetyAdvantage:number, timeDeltaMinutes:number, timeDeltaPct:number,
 *   config:Object
 * }}
 */
export function recommendRoute(analyses, config = {}) {
  const cfg = { ...DEFAULT_RECOMMENDATION_CONFIG, ...config };
  const list = (Array.isArray(analyses) ? analyses : []).filter(
    (a) => a && Number.isFinite(a.score) && Number.isFinite(a.durationSeconds)
  );
  if (!list.length) return null;

  const fastest = list.reduce((m, a) => (a.durationSeconds < m.durationSeconds ? a : m), list[0]);

  const w = {
    safety: Number.isFinite(cfg.weights?.safety) ? cfg.weights.safety : 0.5,
    time: Number.isFinite(cfg.weights?.time) ? cfg.weights.time : 0.5,
  };

  // Weighted decision: blended = w.safety * safetyScore + w.time * timeScore,
  // where the fastest route scores 100 on time and slower routes score in
  // proportion to their duration. Deterministic; ties break on duration.
  let best = null;
  let bestBlend = -Infinity;
  for (const a of list) {
    const timeScore =
      a.durationSeconds > 0 && fastest.durationSeconds > 0
        ? Math.min(100, (fastest.durationSeconds / a.durationSeconds) * 100)
        : 100;
    const blend = w.safety * a.score + w.time * timeScore;
    if (
      !best ||
      blend > bestBlend ||
      (blend === bestBlend && a.durationSeconds < best.durationSeconds)
    ) {
      best = a;
      bestBlend = blend;
    }
  }

  // Fallback (single route, etc.): the fastest route.
  const winner = best || fastest;
  const timeDeltaPct =
    fastest.durationSeconds > 0
      ? ((winner.durationSeconds - fastest.durationSeconds) / fastest.durationSeconds) * 100
      : 0;

  return {
    recommendedIndex: winner.index,
    fastestIndex: fastest.index,
    isFastest: winner.index === fastest.index,
    safetyAdvantage: winner.score - fastest.score,
    timeDeltaMinutes: Math.round(winner.durationSeconds / 60) - Math.round(fastest.durationSeconds / 60),
    timeDeltaPct: Math.round(timeDeltaPct),
    config: cfg,
  };
}

/**
 * Build data-driven "Why this route?" explanations.
 *
 * Every sentence is derived from an actual metric difference between the
 * recommended route and a baseline (the fastest route, or the strongest
 * alternative when the recommendation already is the fastest). Nothing is
 * generated that is not backed by real route data; when no difference exists,
 * an accurate factual statement about the route is returned instead.
 *
 * @param {Array<Object>} analyses analyses from utils/routeAnalysis
 * @param {Object} result output of recommendRoute()
 * @param {number} [maxReasons]
 * @returns {string[]}
 */
export function buildRecommendationReasons(analyses, result, maxReasons = 6) {
  if (!result || !Array.isArray(analyses)) return [];
  const rec = analyses[result.recommendedIndex];
  if (!rec) return [];

  // Baseline: normally the fastest route; if the recommendation IS the
  // fastest, compare against the strongest alternative by safety score.
  let baseline = analyses[result.fastestIndex];
  if (result.isFastest) {
    baseline = analyses.reduce(
      (m, a) => (a && a.index !== rec.index && (!m || a.score > m.score) ? a : m),
      null
    );
  }
  if (!baseline || baseline.index === rec.index) {
    return [`Fastest route (${rec.durationMinutes} min, safety ${rec.score}/100)`];
  }

  const reasons = [];
  const push = (text) => { if (text) reasons.push(text); };

  // 1. Pothole exposure
  const potholeDiff = baseline.potholes.count - rec.potholes.count;
  if (potholeDiff > 0) {
    push(`${potholeDiff} fewer pothole report${potholeDiff === 1 ? "" : "s"} (${rec.potholes.count} vs ${baseline.potholes.count})`);
  }

  // 2. Traffic (only when both routes have traffic data)
  if (rec.traffic?.available && baseline.traffic?.available && rec.traffic.risk < baseline.traffic.risk) {
    push(`Lower traffic congestion (${rec.traffic.label} vs ${baseline.traffic.label})`);
  }

  // 3. Incidents/closures (only when an incident source is available for both)
  if (rec.incidents?.available && baseline.incidents?.available && rec.incidents.count < baseline.incidents.count) {
    const d = baseline.incidents.count - rec.incidents.count;
    push(
      rec.incidents.count === 0
        ? "No active road incidents on this route"
        : `${d} fewer road incident${d === 1 ? "" : "s"}`
    );
  }

  // 4. Weather (only when both routes have weather data)
  if (rec.weather?.available && baseline.weather?.available && rec.weather.risk < baseline.weather.risk) {
    push(`Lower weather risk (${rec.weather.label} vs ${baseline.weather.label})`);
  }

  // 5. High-severity hazards
  const highDiff = baseline.potholes.highCount - rec.potholes.highCount;
  if (highDiff > 0) {
    push(`Fewer high-severity hazards (${rec.potholes.highCount} vs ${baseline.potholes.highCount})`);
  }

  // 6. Overall safety score is already displayed on the card, so the list
  //    focuses on the underlying factor differences.

  // Travel time is always acknowledged when it differs — reserved a slot so
  // the cap on other reasons can never hide the real time cost/benefit.
  const timeDiff = rec.durationMinutes - baseline.durationMinutes;
  const timeReason =
    timeDiff > 0
      ? `Only ${timeDiff} minute${timeDiff === 1 ? "" : "s"} longer`
      : timeDiff < 0
        ? `${-timeDiff} minute${-timeDiff === 1 ? "" : "s"} faster`
        : null;

  if (!reasons.length && !timeReason) {
    return [`Fastest route (${rec.durationMinutes} min) with matching safety score`];
  }

  const budget = Math.max(1, maxReasons - (timeReason ? 1 : 0));
  const out = reasons.slice(0, budget);
  if (timeReason) out.push(timeReason);
  return out;
}
