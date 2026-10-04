/**
 * Shared geographic helpers (Web-Mercator approximations, meters).
 * Pure functions used by route analysis, hazard checks and map tooling.
 */

/** Convert [lng, lat] to approximate metric Web-Mercator coordinates. */
export const lonLatToMeters = (lng, lat) => {
  const x = (lng * Math.PI * 6378137) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 6378137;
  return [x, y];
};

/** Distance in meters from point p to segment [a, b] (Mercator approximation). */
export const pointSegDistMeters = (p, a, b) => {
  const [px, py] = lonLatToMeters(p[0], p[1]);
  const [ax, ay] = lonLatToMeters(a[0], a[1]);
  const [bx, by] = lonLatToMeters(b[0], b[1]);
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const segLen2 = vx * vx + vy * vy;
  let t = segLen2 > 0 ? (wx * vx + wy * vy) / segLen2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * vx, cy = ay + t * vy;
  const dx = px - cx, dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
};

/** Minimum distance in meters from a point to a polyline. */
export const pointLineDistMeters = (point, lineCoords) => {
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) return Infinity;
  let minD = Infinity;
  for (let i = 0; i < lineCoords.length - 1; i += 1) {
    const d = pointSegDistMeters(point, lineCoords[i], lineCoords[i + 1]);
    if (d < minD) minD = d;
  }
  return minD;
};

/** Distance in meters between two [lng, lat] points. */
export const distMeters = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  const [ax, ay] = lonLatToMeters(a[0], a[1]);
  const [bx, by] = lonLatToMeters(b[0], b[1]);
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Cumulative distance in meters at each vertex of a polyline.
 * @returns {number[]} same length as coords, first entry 0
 */
export const cumulativeDistances = (coords) => {
  const out = [0];
  if (!Array.isArray(coords) || coords.length < 2) return out;
  for (let i = 1; i < coords.length; i += 1) {
    const d = distMeters(coords[i - 1], coords[i]);
    out.push(out[i - 1] + (Number.isFinite(d) ? d : 0));
  }
  return out;
};

/**
 * Find the nearest segment of a polyline to a point.
 * @returns {{index:number, distance:number, along:number}}
 *   index = segment start vertex, distance = perpendicular meters,
 *   along = projected distance along the polyline (meters)
 */
export const nearestSegment = (point, coords) => {
  if (!isValidCoord(point) || !Array.isArray(coords) || coords.length < 2) return null;
  const cum = cumulativeDistances(coords);
  let best = null;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i];
    const b = coords[i + 1];
    const d = pointSegDistMeters(point, a, b);
    if (!best || d < best.distance) {
      // Projection factor along this segment for the 'along' value
      const [px, py] = lonLatToMeters(point[0], point[1]);
      const [ax, ay] = lonLatToMeters(a[0], a[1]);
      const [bx, by] = lonLatToMeters(b[0], b[1]);
      const vx = bx - ax, vy = by - ay;
      const segLen2 = vx * vx + vy * vy;
      let t = segLen2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / segLen2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const segLen = distMeters(a, b);
      best = { index: i, distance: d, along: cum[i] + (Number.isFinite(segLen) ? segLen : 0) * t };
    }
  }
  return best;
};

/** True when a value is a plausible [lng, lat] pair. */
export const isValidCoord = (coord) =>
  Array.isArray(coord) &&
  coord.length >= 2 &&
  Number.isFinite(Number(coord[0])) &&
  Number.isFinite(Number(coord[1])) &&
  Math.abs(Number(coord[1])) <= 90 &&
  Math.abs(Number(coord[0])) <= 180;
