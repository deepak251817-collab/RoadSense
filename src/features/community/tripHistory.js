/**
 * Trip history.
 *
 * A trip is one usage of a route: origin/destination, the chosen route's
 * distance/time/safety score, and when it ended (arrival or otherwise).
 * History is capped and validated on load so corrupt or oversized
 * localStorage data can never break the app.
 *
 * All functions are pure except load/save, which take an injectable
 * storage-like object (defaults to window.localStorage) for testability.
 */

export const TRIP_HISTORY_KEY = "tripHistory";
export const MAX_TRIPS = 50;

const hasCoord = (c) =>
  Array.isArray(c) &&
  c.length >= 2 &&
  Number.isFinite(Number(c[0])) &&
  Number.isFinite(Number(c[1]));

const num = (v, fallback = null) =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? fallback : Number(v);

/**
 * Create a trip record.
 * @returns {Object|null} null when required fields are missing/invalid
 */
export function createTrip({
  originCoord,
  originLabel = "",
  destCoord,
  destLabel = "",
  routeIndex = 0,
  distanceMeters = null,
  durationMinutes = null,
  safetyScore = null,
  classification = "",
  incidentCount = null,
  potholeCount = null,
  weather = null,
  startedAt = Date.now(),
} = {}) {
  if (!hasCoord(originCoord) || !hasCoord(destCoord)) return null;
  return {
    id: `trip-${num(startedAt, Date.now())}-${Math.round(num(routeIndex, 0))}-${Math.round(
      Number(destCoord[0]) * 1e5
    )}`,
    originCoord: [Number(originCoord[0]), Number(originCoord[1])],
    destCoord: [Number(destCoord[0]), Number(destCoord[1])],
    originLabel: String(originLabel || ""),
    destLabel: String(destLabel || ""),
    routeIndex: Math.max(0, Math.round(num(routeIndex, 0))),
    distanceMeters: num(distanceMeters),
    durationMinutes: num(durationMinutes),
    safetyScore: num(safetyScore),
    classification: String(classification || ""),
    incidentCount: num(incidentCount),
    potholeCount: num(potholeCount),
    weather: weather ? String(weather) : null,
    startedAt: num(startedAt, Date.now()),
    endedAt: null,
    arrived: false,
  };
}

/** End a trip (arrival or early stop). Returns a new object. */
export function endTrip(trip, { arrived = false, endedAt = Date.now() } = {}) {
  if (!trip || typeof trip !== "object") return trip;
  return {
    ...trip,
    endedAt: num(endedAt, Date.now()),
    arrived: Boolean(arrived),
  };
}

/** Insert or replace a trip (by id), newest first, capped at MAX_TRIPS. */
export function upsertTrip(trips, trip) {
  if (!trip || typeof trip.id !== "string") return Array.isArray(trips) ? trips : [];
  const list = Array.isArray(trips) ? trips.filter((t) => t && typeof t.id === "string") : [];
  const next = [trip, ...list.filter((t) => t.id !== trip.id)];
  next.sort((a, b) => num(b.startedAt, 0) - num(a.startedAt, 0));
  return next.slice(0, MAX_TRIPS);
}

/** Replace one trip in place (by id) — used when an active trip ends. */
export function replaceTrip(trips, trip) {
  if (!trip || typeof trip.id !== "string" || !Array.isArray(trips)) return trips;
  return trips.map((t) => (t && t.id === trip.id ? trip : t));
}

/** Validate one stored record; returns null when unusable. */
function sanitizeTrip(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!hasCoord(raw.originCoord) || !hasCoord(raw.destCoord)) return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  return {
    id: raw.id,
    originCoord: [Number(raw.originCoord[0]), Number(raw.originCoord[1])],
    destCoord: [Number(raw.destCoord[0]), Number(raw.destCoord[1])],
    originLabel: String(raw.originLabel || ""),
    destLabel: String(raw.destLabel || ""),
    routeIndex: Math.max(0, Math.round(num(raw.routeIndex, 0))),
    distanceMeters: num(raw.distanceMeters),
    durationMinutes: num(raw.durationMinutes),
    safetyScore: num(raw.safetyScore),
    classification: String(raw.classification || ""),
    incidentCount: num(raw.incidentCount),
    potholeCount: num(raw.potholeCount),
    weather: raw.weather ? String(raw.weather) : null,
    startedAt: num(raw.startedAt, 0),
    endedAt: num(raw.endedAt),
    arrived: Boolean(raw.arrived),
  };
}

/** Load trip history from storage. Corrupt data → []. Newest first, capped. */
export function loadTripHistory(storage = null) {
  try {
    const s = storage || (typeof window !== "undefined" ? window.localStorage : null);
    if (!s) return [];
    const raw = s.getItem(TRIP_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const clean = parsed.map(sanitizeTrip).filter(Boolean);
    clean.sort((a, b) => num(b.startedAt, 0) - num(a.startedAt, 0));
    return clean.slice(0, MAX_TRIPS);
  } catch {
    return [];
  }
}

/** Persist trip history (validated, capped). Never throws. */
export function saveTripHistory(trips, storage = null) {
  try {
    const s = storage || (typeof window !== "undefined" ? window.localStorage : null);
    if (!s) return false;
    const list = (Array.isArray(trips) ? trips : []).map(sanitizeTrip).filter(Boolean);
    list.sort((a, b) => num(b.startedAt, 0) - num(a.startedAt, 0));
    s.setItem(TRIP_HISTORY_KEY, JSON.stringify(list.slice(0, MAX_TRIPS)));
    return true;
  } catch {
    return false;
  }
}

/** Human label for a trip's route; falls back to coordinates. */
function routeLabel(t) {
  const from =
    t.originLabel ||
    `${Number(t.originCoord?.[1]).toFixed(4)}, ${Number(t.originCoord?.[0]).toFixed(4)}`;
  const to =
    t.destLabel || `${Number(t.destCoord?.[1]).toFixed(4)}, ${Number(t.destCoord?.[0]).toFixed(4)}`;
  return `${from} → ${to}`;
}

/**
 * Identity of a trip's origin→destination pair. Labels when both exist,
 * otherwise rounded coordinates (so two unlabeled trips only merge when they
 * really are the same endpoints).
 */
function routeKey(t) {
  if (t.originLabel && t.destLabel) {
    return `${t.originLabel.trim().toLowerCase()}→${t.destLabel.trim().toLowerCase()}`;
  }
  return `${Number(t.originCoord?.[0]).toFixed(5)},${Number(t.originCoord?.[1]).toFixed(5)}→${Number(
    t.destCoord?.[0]
  ).toFixed(5)},${Number(t.destCoord?.[1]).toFixed(5)}`;
}

/**
 * Aggregate stats over trip history (basis for safety analytics).
 * Only ended trips count toward duration/time metrics; open trips are
 * counted separately.
 *
 * @returns {{tripCount:number, activeCount:number, arrivedCount:number,
 *   totalKm:number, totalMinutes:number, avgSafety:number|null,
 *   scoredCount:number,
 *   totalIncidents:number, totalPotholes:number, hazardsEncountered:number,
 *   withWeather:number, safestRoute:Object|null, mostFrequentRoute:Object|null}}
 */
export function tripSummary(trips) {
  const list = Array.isArray(trips) ? trips.filter((t) => t && typeof t === "object") : [];
  const ended = list.filter((t) => t.endedAt != null);
  const scores = ended.map((t) => num(t.safetyScore)).filter((v) => v != null);
  const durations = ended
    .map((t) => {
      if (t.durationMinutes != null) return num(t.durationMinutes);
      if (t.endedAt != null && t.startedAt != null) return Math.round((t.endedAt - t.startedAt) / 60000);
      return null;
    })
    .filter((v) => v != null);

  // Hazards actually encountered on ended trips (recorded counts only).
  const hazardsEncountered = ended.reduce(
    (sum, t) => sum + (num(t.incidentCount) || 0) + (num(t.potholeCount) || 0),
    0
  );

  // Safest route actually driven: highest recorded safety score, ties → newest.
  let safestRoute = null;
  for (const t of ended) {
    const score = num(t.safetyScore);
    if (score == null) continue;
    const startedAt = num(t.startedAt, 0);
    if (
      !safestRoute ||
      score > safestRoute.safetyScore ||
      (score === safestRoute.safetyScore && startedAt > safestRoute.startedAt)
    ) {
      safestRoute = {
        label: routeLabel(t),
        safetyScore: score,
        classification: t.classification || "",
        startedAt,
      };
    }
  }

  // Most frequent route by origin→destination pair (all recorded trips).
  const counts = new Map();
  for (const t of list) {
    const key = routeKey(t);
    const entry = counts.get(key) || { label: routeLabel(t), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  let mostFrequentRoute = null;
  for (const entry of counts.values()) {
    if (!mostFrequentRoute || entry.count > mostFrequentRoute.count) mostFrequentRoute = entry;
  }

  return {
    tripCount: list.length,
    activeCount: list.filter((t) => t.endedAt == null).length,
    arrivedCount: ended.filter((t) => t.arrived).length,
    totalKm: Math.round(
      (ended.reduce((sum, t) => sum + (num(t.distanceMeters) || 0), 0) / 1000) * 10
    ) / 10,
    totalMinutes: durations.reduce((a, b) => a + b, 0),
    avgSafety: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
    /** How many ended trips actually carried a safety score (the evidence behind avgSafety). */
    scoredCount: scores.length,
    totalIncidents: ended.reduce((sum, t) => sum + (num(t.incidentCount) || 0), 0),
    totalPotholes: ended.reduce((sum, t) => sum + (num(t.potholeCount) || 0), 0),
    hazardsEncountered,
    withWeather: list.filter((t) => t.weather).length,
    safestRoute,
    mostFrequentRoute,
  };
}
