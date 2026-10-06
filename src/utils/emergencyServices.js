/**
 * Nearby emergency services — live data from OpenStreetMap's Overpass API.
 *
 * Honest by construction:
 *   - results are community-mapped OSM data (coverage varies by area) —
 *     never presented as an authoritative directory,
 *   - distances are real straight-line measurements from the resolved
 *     position,
 *   - any network/service failure degrades to an explicit error result
 *     instead of pretending "no services exist".
 *
 * No new dependencies: uses the existing httpClient (timeout + retry +
 * TTL cache).
 */
import { distMeters, isValidCoord } from "./geo";
import { fetchJsonCached, clearHttpCache } from "../services/httpClient";

/** Honest label shown with every result. */
export const EMERGENCY_SERVICES_LABEL = "Live OpenStreetMap data";

/** Disclosure shown next to results. */
export const EMERGENCY_SERVICES_DISCLAIMER =
	"Community-mapped OpenStreetMap data — coverage varies by area and hours may be out of date. In an emergency call 112 regardless of this list.";

/** Default search radius (meters). */
export const SERVICES_RADIUS_METERS = 5000;

/** Max results rendered. */
export const SERVICES_MAX_RESULTS = 12;

/** OSM TTL cache lifetime for the same area. */
export const SERVICES_CACHE_TTL_MS = 10 * 60 * 1000;

/** Overpass endpoint (env-overridable for tests/mirrors). */
export const OVERPASS_ENDPOINT =
	(typeof import.meta !== "undefined" && import.meta.env?.VITE_OVERPASS_URL) ||
	"https://overpass-api.de/api/interpreter";

/** amenity tag → display category. Only genuine emergency-relevant types. */
export const SERVICE_CATEGORY_BY_AMENITY = {
	hospital: "Hospital",
	clinic: "Clinic",
	police: "Police station",
	fire_station: "Fire station",
};

/** Fallback name when OSM has no name tag. */
function serviceName(tags, category) {
	const name = tags?.name || tags?.["name:en"];
	if (name && String(name).trim()) return String(name).trim();
	return `Unnamed ${String(category).toLowerCase()}`;
}

/**
 * Build the Overpass QL query for services around a coordinate.
 * Nodes and ways/relations (via center) are both requested.
 */
export function buildOverpassQuery(coord, radiusMeters = SERVICES_RADIUS_METERS) {
	if (!isValidCoord(coord)) return null;
	const [lng, lat] = coord;
	const r = Math.max(100, Math.round(radiusMeters));
	// Plain regex alternation — the QL string literal adds its own quotes.
	const amenities = Object.keys(SERVICE_CATEGORY_BY_AMENITY).join("|");
	return (
		`[out:json][timeout:25];(\n` +
		`  node["amenity"~"${amenities}"](around:${r},${lat},${lng});\n` +
		`  way["amenity"~"${amenities}"](around:${r},${lat},${lng});\n` +
		`  relation["amenity"~"${amenities}"](around:${r},${lat},${lng});\n` +
		`);\n` +
		`out center;`
	);
}

/** Full GET URL for the Overpass endpoint (null when coord invalid). */
export function buildOverpassUrl(coord, radiusMeters = SERVICES_RADIUS_METERS, endpoint = OVERPASS_ENDPOINT) {
	const q = buildOverpassQuery(coord, radiusMeters);
	if (!q) return null;
	return `${endpoint}?data=${encodeURIComponent(q)}`;
}

/**
 * Parse an Overpass JSON response into nearest-first service entries with
 * real measured distances. Unknown amenities and out-of-range items are
 * dropped; missing names get an honest "Unnamed …" fallback.
 *
 * @param {Object} json Overpass response { elements: [...] }
 * @param {Array} origin [lng, lat] position to measure from
 * @returns {Array<{id,name,category,amenity,coord,distanceMeters,phone,openingHours}>}
 */
export function parseOverpassServices(json, origin, { range = SERVICES_RADIUS_METERS, limit = SERVICES_MAX_RESULTS } = {}) {
	if (!isValidCoord(origin) || !Array.isArray(json?.elements)) return [];
	const out = [];
	const seen = new Set();
	for (const el of json.elements) {
		if (!el) continue;
		const amenity = el.tags?.amenity;
		const category = SERVICE_CATEGORY_BY_AMENITY[amenity];
		if (!category) continue;
		let coord = null;
		if (el.type === "node" && isValidCoord([el.lon, el.lat])) {
			coord = [Number(el.lon), Number(el.lat)];
		} else if (isValidCoord(el.center ? [el.center.lon, el.center.lat] : null)) {
			coord = [Number(el.center.lon), Number(el.center.lat)];
		}
		if (!coord) continue;
		const d = distMeters(origin, coord);
		if (!Number.isFinite(d) || d > range) continue;
		const id = `${el.type}/${el.id}`;
		if (seen.has(id)) continue;
		seen.add(id);
		out.push({
			id,
			name: serviceName(el.tags, category),
			category,
			amenity,
			coord,
			distanceMeters: Math.round(d),
			phone: el.tags?.phone || el.tags?.["contact:phone"] || null,
			openingHours: el.tags?.opening_hours || null,
		});
	}
	out.sort(
		(a, b) =>
			a.distanceMeters - b.distanceMeters ||
			a.category.localeCompare(b.category) ||
			a.name.localeCompare(b.name)
	);
	return out.slice(0, limit);
}

/**
 * Fetch nearby emergency services. Never throws: failures return
 * { ok: false, services: [], error } so the UI can show an explicit
 * "could not fetch" state instead of an empty-as-clearance list.
 *
 * @param {Array} coord [lng, lat] position to search around
 * @param {Object} [opts]
 * @param {number} [opts.radiusMeters]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ok:boolean, services:Array, fetchedAt:number, cached?:boolean, error?:string}>}
 */
export async function fetchEmergencyServices(coord, { radiusMeters = SERVICES_RADIUS_METERS, signal } = {}) {
	const fetchedAt = Date.now();
	if (!isValidCoord(coord)) {
		return { ok: false, services: [], fetchedAt, error: "No position available to search around." };
	}
	const url = buildOverpassUrl(coord, radiusMeters);
	try {
		const { data, cached } = await fetchJsonCached(url, {
			ttlMs: SERVICES_CACHE_TTL_MS,
			cacheKey: `overpass:${coord[0].toFixed(3)},${coord[1].toFixed(3)},${radiusMeters}`,
			timeoutMs: 25000,
			retries: 1,
			signal,
		});
		const services = parseOverpassServices(data, coord, { range: radiusMeters });
		return { ok: true, services, fetchedAt, cached };
	} catch (err) {
		const error =
			err?.name === "HttpError" && String(err.message).startsWith("Timeout")
				? "The OpenStreetMap service timed out."
				: "Could not reach the OpenStreetMap service. Try again shortly.";
		return { ok: false, services: [], fetchedAt, error };
	}
}

/** Clear cached Overpass responses (used by tests / force refresh). */
export function clearEmergencyServicesCache() {
	clearHttpCache();
}
