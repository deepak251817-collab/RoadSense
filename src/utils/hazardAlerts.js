/**
 * Route-aware hazard alert engine (pure logic).
 *
 * Decides which incidents along the active route deserve an alert, tracks each
 * alert through its lifecycle (pending → shown → dismissed → expired) and
 * throttles how often new alerts may appear so the user is never spammed.
 * Pure functions only — no DOM, no React — so the behaviour is testable.
 */

/** Configurable alert behaviour. */
export const ALERT_CONFIG = {
  /** How far ahead (meters along the route) alerts may appear. */
  rangeMeters: 1200,
  /** Per-alert cooldown before it may be shown again. */
  cooldownMs: 5 * 60 * 1000,
  /** Minimum gap between two newly shown alerts. */
  minGapMs: 10 * 1000,
  /** Maximum alerts visible at the same time. */
  maxVisible: 2,
  /** User further than this from the route → route alerts pause. */
  maxOffRouteMeters: 1500,
};

/** Map an incident to an alert title/message — or null if not alert-worthy. */
export function classifyIncidentForAlert(incident) {
  if (!incident) return null;
  const type = String(incident.type || "");
  const sev = String(incident.severity || "medium");
  const high = sev === "high" || sev === "critical";
  switch (type) {
    case "hazard":
      // Reports in STARS are pothole reports
      return high ? { title: "WARNING", message: "High-severity pothole ahead" } : null;
    case "congestion":
      if (!high) return null;
      return sev === "critical"
        ? { title: "HEAVY TRAFFIC", message: "Severe traffic congestion ahead" }
        : { title: "HEAVY TRAFFIC", message: "Heavy traffic ahead" };
    case "closure":
      return { title: "ROAD CLOSURE", message: "Road closure ahead" };
    case "accident":
      return { title: "ACCIDENT", message: "Accident ahead" };
    case "construction":
      return sev === "critical" ? { title: "ROAD WORK", message: "Major road work ahead" } : null;
    case "lane_restriction":
      return sev === "critical" ? { title: "LANE RESTRICTION", message: "Lane restriction ahead" } : null;
    default:
      return sev === "critical" ? { title: "ROAD HAZARD", message: "Serious road hazard ahead" } : null;
  }
}

/** Format an "ahead" distance the way alerts display it. */
export const formatAheadDistance = (meters) => {
  if (!Number.isFinite(meters)) return "";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
};

/**
 * Evaluate alert states for the current tick.
 *
 * @param {Object} prevStates previous state map { [key]: {state, lastShownAt} }
 * @param {Array<Object>} candidates alerts derived from incidents that are
 *   ahead of the user: { key, title, message, severity, aheadMeters, coord }
 * @param {Object} [opts]
 * @param {number} [opts.now] epoch ms (injectable for deterministic tests)
 * @param {Object} [opts.config] override of ALERT_CONFIG
 * @returns {{states:Object, visible:Array, pendingKeys:string[]}}
 */
export function evaluateHazardAlerts(prevStates, candidates, { now = Date.now(), config = ALERT_CONFIG } = {}) {
  const states = { ...(prevStates || {}) };
  const list = Array.isArray(candidates) ? candidates : [];

  // "Valid" = ahead of the user and within the alert range
  const valid = list.filter(
    (c) => Number.isFinite(c.aheadMeters) && c.aheadMeters >= 0 && c.aheadMeters <= config.rangeMeters
  );
  const validKeys = new Set(valid.map((c) => c.key));

  // Anything no longer valid (passed the user, out of range, route changed)
  // that was pending or visible becomes expired.
  for (const [key, st] of Object.entries(states)) {
    if (!validKeys.has(key) && (st.state === "pending" || st.state === "shown")) {
      states[key] = { state: "expired", lastShownAt: st.lastShownAt || null };
    }
  }

  const sorted = [...valid].sort((a, b) => a.aheadMeters - b.aheadMeters);
  const visible = [];
  const fresh = [];

  for (const c of sorted) {
    const st = states[c.key];
    if (st && (st.state === "shown" || st.state === "dismissed")) {
      const inCooldown = st.lastShownAt && now - st.lastShownAt < config.cooldownMs;
      if (inCooldown) {
        // Still visible until dismissed/aged out; dismissed stays hidden.
        if (st.state === "shown") visible.push(c);
        continue;
      }
      // Cooldown elapsed → eligible to be shown again.
    } else if (st && st.state === "expired") {
      // Expired alerts only return after the cooldown (if they were ever shown).
      if (st.lastShownAt && now - st.lastShownAt < config.cooldownMs) continue;
    }
    fresh.push(c);
  }

  // Promote at most maxVisible. The minGap throttle is measured against the
  // last time ANY alert was shown before this evaluation (a batch of alerts
  // found in one pass is promoted together).
  let prevLastShownAny = 0;
  for (const st of Object.values(prevStates || {})) {
    if (st.lastShownAt) prevLastShownAny = Math.max(prevLastShownAny, st.lastShownAt);
  }

  let promoted = 0;
  const pendingKeys = [];
  for (const c of fresh) {
    if (visible.length >= config.maxVisible) {
      states[c.key] = { state: "pending", lastShownAt: states[c.key]?.lastShownAt || null };
      pendingKeys.push(c.key);
      continue;
    }
    const gapOk =
      promoted === 0 ? now - prevLastShownAny >= config.minGapMs : true;
    if (gapOk) {
      states[c.key] = { state: "shown", lastShownAt: now };
      visible.push(c);
      promoted += 1;
    } else {
      states[c.key] = { state: "pending", lastShownAt: states[c.key]?.lastShownAt || null };
      pendingKeys.push(c.key);
    }
  }

  visible.sort((a, b) => a.aheadMeters - b.aheadMeters);
  return { states, visible, pendingKeys };
}

/**
 * Mark an alert as dismissed by the user (suppresses it for the cooldown).
 * @returns {Object} new states map
 */
export function dismissHazardAlert(states, key, now = Date.now()) {
  return {
    ...(states || {}),
    [key]: { state: "dismissed", lastShownAt: now },
  };
}
