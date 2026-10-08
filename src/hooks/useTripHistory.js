import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTrip,
  endTrip,
  upsertTrip,
  replaceTrip,
  loadTripHistory,
  saveTripHistory,
} from "../utils/tripHistory";
import { distMeters } from "../utils/geo";

/**
 * Trip history recorder.
 *
 * - Loads persisted trips once on mount.
 * - Opening a route starts a trip; switching/clearing routes ends the
 *   previous one. The trip snapshot records conditions known at start
 *   (later traffic refreshes do not rewrite history).
 * - Reaching the destination (within 120 m) completes the active trip.
 *
 * @param {Object} ctx navigation context from the app
 * @param {Array} ctx.routes current routes
 * @param {string|number|null} ctx.selectedRouteId selected route index
 * @param {Array} ctx.routeAnalyses analyzed routes (safety scores)
 * @param {number[]|null} ctx.sourceCoord origin coord
 * @param {number[]|null} ctx.destCoord destination coord
 * @param {string} ctx.sourceQuery origin label
 * @param {string} ctx.destQuery destination label
 * @param {number[]|null} ctx.userCoord live user position
 * @param {string|null} [ctx.weatherLabel] weather condition known at trip start
 * @returns {{tripHistory:Array, persistTrips:Function}}
 */
export default function useTripHistory({
  routes,
  selectedRouteId,
  routeAnalyses,
  sourceCoord,
  destCoord,
  sourceQuery,
  destQuery,
  userCoord,
  weatherLabel = null,
}) {
  const [tripHistory, setTripHistory] = useState([]);
  const activeTripRef = useRef(null); // { trip, routeIndex } — trip not yet ended
  // Snapshot of the weather label at the moment a trip starts (never retriggers it)
  const weatherRef = useRef(weatherLabel);
  weatherRef.current = weatherLabel;

  // Stable identity: only touches the (stable) setter and module imports,
  // so consumers can memoize on it.
  const persistTrips = useCallback((updater) => {
    setTripHistory((prev) => {
      const next = updater(prev);
      saveTripHistory(next);
      return next;
    });
  }, []);

  // Load persisted history once on mount
  useEffect(() => {
    setTripHistory(loadTripHistory());
  }, []);

  // Opening a route starts a trip; switching/clearing ends the previous one
  useEffect(() => {
    if (activeTripRef.current) {
      const closed = endTrip(activeTripRef.current.trip, { arrived: false });
      activeTripRef.current = null;
      persistTrips((prev) => replaceTrip(prev, closed));
    }
    if (selectedRouteId == null || !Array.isArray(routes) || !routes.length) return;
    const idx = Number(selectedRouteId);
    const ana = routeAnalyses?.[idx];
    const trip = createTrip({
      originCoord: sourceCoord,
      originLabel: sourceQuery || "",
      destCoord: destCoord,
      destLabel: destQuery || "",
      routeIndex: idx,
      distanceMeters: ana?.distanceMeters ?? routes[idx]?.distance,
      durationMinutes:
        ana?.durationMinutes ?? (routes[idx]?.duration ? Math.round(routes[idx].duration / 60) : null),
      safetyScore: ana?.score ?? null,
      classification: ana?.classification?.label ?? "",
      incidentCount: ana?.incidents?.count ?? null,
      potholeCount: ana?.potholes?.count ?? null,
      weather: weatherRef.current ?? null,
    });
    if (!trip) return;
    activeTripRef.current = { trip, routeIndex: idx };
    persistTrips((prev) => upsertTrip(prev, trip));
  }, [selectedRouteId, routes]);

  // Arrival: user within 120 m of the destination completes the active trip
  useEffect(() => {
    const active = activeTripRef.current;
    if (!active || !userCoord || !destCoord) return;
    if (distMeters(userCoord, destCoord) > 120) return;
    const trip = endTrip(active.trip, { arrived: true });
    activeTripRef.current = null;
    persistTrips((prev) => replaceTrip(prev, trip));
  }, [userCoord, destCoord]);

  return { tripHistory, persistTrips };
}
