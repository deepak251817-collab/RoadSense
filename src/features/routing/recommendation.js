/**
 * Safety-aware route recommendation.
 *
 * Chooses the safest *practical* route: a route that is moderately slower but
 * substantially safer can win, while a route that is only marginally safer but
 * much slower is rejected by the travel-time tolerance rules. Purely
 * deterministic — no randomness, no fabricated inputs.
 */

/** Configurable recommendation policy. */
export const DEFAULT_RECOMMENDATION_CONFIG = {
  /** Max extra travel time (vs fastest) for a "normal" detour. */
  timeTolerancePct: 25,
  /** Safety-score advantage required to accept a normal detour. */
  minSafetyAdvantage: 5,
  /** Larger detours need a much stronger safety argument. */
  strongSafetyAdvantage: 15,
  /** Never accept a route slower than this % vs the fastest route. */
  hardTimeCapPct: 40,
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

  let best = null;
  for (const a of list) {
    const timeDeltaPct =
      fastest.durationSeconds > 0
        ? ((a.durationSeconds - fastest.durationSeconds) / fastest.durationSeconds) * 100
        : 0;
    const safetyAdvantage = a.score - fastest.score;

    let eligible;
    if (a.index === fastest.index) {
      eligible = true;
    } else if (timeDeltaPct > cfg.hardTimeCapPct) {
      // Dramatically slower routes are never auto-preferred.
      eligible = false;
    } else if (timeDeltaPct <= cfg.timeTolerancePct) {
      eligible = safetyAdvantage >= cfg.minSafetyAdvantage;
    } else {
      // Beyond normal tolerance: only a significant safety gain justifies it.
      eligible = safetyAdvantage >= cfg.strongSafetyAdvantage;
    }
    if (!eligible) continue;

    if (
      !best ||
      a.score > best.score ||
      (a.score === best.score && a.durationSeconds < best.durationSeconds)
    ) {
      best = a;
    }
  }

  // Fallback: nothing eligible (single route, etc.) → fastest route.
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
