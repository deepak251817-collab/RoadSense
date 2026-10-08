/**
 * useHazardAlerts — route-aware hazard alerts for the active route.
 *
 * Projects the user and each incident onto the selected route, keeps only
 * alerts that are genuinely AHEAD of the user within range, and drives the
 * pure alert evaluator (utils/hazardAlerts) including throttling and the
 * pending → shown → dismissed → expired lifecycle.
 */
import { useEffect, useRef, useState } from "react";
import { cumulativeDistances, nearestSegment } from "../features/routing/geo";
import {
  ALERT_CONFIG,
  classifyIncidentForAlert,
  evaluateHazardAlerts,
  dismissHazardAlert,
} from "../features/safety/hazardAlerts";

/**
 * @param {Object} args
 * @param {Array|null} args.userCoord user's [lng, lat]
 * @param {Array|null} args.routeCoords selected route geometry coordinates
 * @param {Array|null} args.incidents incidents for the selected route
 * @param {boolean} [args.enabled]
 * @returns {{alerts:Array, dismiss:(key:string)=>void, hasAlerts:boolean}}
 */
export default function useHazardAlerts({ userCoord, routeCoords, incidents, enabled = true }) {
  const statesRef = useRef({});
  const [alerts, setAlerts] = useState([]);

  // Latest inputs in a ref so the interval can re-run without stale closures
  const inputsRef = useRef({ userCoord, routeCoords, incidents, enabled });
  inputsRef.current = { userCoord, routeCoords, incidents, enabled };

  const runEvaluation = () => {
    const { userCoord: uc, routeCoords: rc, incidents: inc, enabled: en } = inputsRef.current;
    if (!en || !uc || !Array.isArray(rc) || rc.length < 2 || !Array.isArray(inc)) {
      setAlerts([]);
      return;
    }
    const userSeg = nearestSegment(uc, rc);
    if (!userSeg || userSeg.distance > ALERT_CONFIG.maxOffRouteMeters) {
      // User is not on this route — route-ahead alerts are meaningless
      setAlerts([]);
      return;
    }
    const candidates = [];
    for (const item of inc) {
      const draft = classifyIncidentForAlert(item);
      if (!draft || !Array.isArray(item?.coord)) continue;
      const seg = nearestSegment(item.coord, rc);
      if (!seg) continue;
      const aheadMeters = Math.round(seg.along - userSeg.along);
      candidates.push({
        key: item.id,
        severity: item.severity,
        coord: item.coord,
        ...draft,
        aheadMeters,
      });
    }
    const result = evaluateHazardAlerts(statesRef.current, candidates, { now: Date.now() });
    statesRef.current = result.states;
    setAlerts(result.visible);
  };

  // Re-evaluate whenever location, route, incidents or selection change
  useEffect(() => {
    runEvaluation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCoord, routeCoords, incidents, enabled]);

  // Periodic re-check so throttled pending alerts can surface while moving
  useEffect(() => {
    const iv = setInterval(() => { try { runEvaluation(); } catch { } }, 10000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = (key) => {
    statesRef.current = dismissHazardAlert(statesRef.current, key, Date.now());
    setAlerts((prev) => prev.filter((a) => a.key !== key));
  };

  return { alerts, dismiss, hasAlerts: alerts.length > 0 };
}
