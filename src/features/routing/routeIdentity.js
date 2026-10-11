/**
 * Route identity — one source of truth for route ids, labels and counts.
 *
 * Mapbox returns routes as a plain array with no stable id, so the app
 * previously identified routes by array index alone (`String(idx)`)
 * and re-derived the "Route N" label in six different components.
 * These helpers make the routes array itself the single source of
 * truth: ids are stamped onto each result set once (unique across
 * fetches), and every surface derives its label/key/count from here.
 */

let fetchSeq = 0;

/**
 * Stamp stable ids onto a fresh route list (mutates each route once).
 * Ids stay unique across fetches so React keys never collide when a
 * new result set replaces the old one.
 *
 * @param {Array<Object>} routes Mapbox route results
 * @returns {Array<Object>} the same array
 */
export function assignRouteIds(routes) {
  if (!Array.isArray(routes)) return routes;
  fetchSeq += 1;
  routes.forEach((r, i) => {
    if (r && !r.id) r.id = `r${fetchSeq}-${i}-${Math.round(r?.duration ?? 0)}`;
  });
  return routes;
}

/**
 * Human-readable label for the route at position i ("Route 1").
 * Used by route cards, the comparison table, map chips and sections.
 *
 * @param {number|string} i zero-based route index
 * @returns {string}
 */
export function routeLabel(i) {
  return `Route ${Number(i) + 1}`;
}

/**
 * Stable React key / map id for the route at position i.
 *
 * @param {Array<Object>} routes route list
 * @param {number|string} i zero-based route index
 * @returns {string}
 */
export function routeKeyAt(routes, i) {
  return routes?.[Number(i)]?.id ?? String(i);
}
