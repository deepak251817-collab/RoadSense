/**
 * Emergency mode — rule-based roadside-emergency assistance.
 *
 * Everything here is deterministic and honest:
 *   - static, publicly published India emergency numbers (not a dispatcher),
 *   - real straight-line distances from your position to reports/incidents
 *     already stored in this app (never invented locations),
 *   - a fixed rule-based checklist whose every step discloses why it appears.
 *
 * This module never claims to contact anyone, locate you, or dispatch help.
 */
import { distMeters, pointLineDistMeters, isValidCoord } from "../routing/geo";
import { isActiveStatus } from "../admin/hazardLifecycle";
import { hazardTypeMeta } from "../safety/hazardTypes";
import { isNightTime, NIGHT_WINDOW } from "../road-conditions/nightSafety";

/** Honest label for everything produced here. */
export const EMERGENCY_LABEL = "Rule-based checklist";

/** Disclaimer shown with the panel. */
export const EMERGENCY_DISCLAIMER =
	"Fixed rule-based guidance compiled from your location, the reports stored in this app and any weather you have fetched. It does not contact emergency services, dispatch help or replace calling 112.";

/**
 * Publicly published all-India emergency numbers (static reference data).
 * The UI renders these as tel: links; this module only carries them.
 */
export const EMERGENCY_NUMBERS = [
	{ id: "all", label: "All emergencies", number: "112", note: "National emergency response" },
	{ id: "ambulance", label: "Ambulance", number: "108", note: "Emergency medical" },
	{ id: "police", label: "Police", number: "100", note: "Police control room" },
	{ id: "fire", label: "Fire & rescue", number: "101", note: "Fire service" },
];

/** Range (meters) around the resolved position searched for context. */
export const EMERGENCY_NEARBY_RANGE_METERS = 300;

/** Max entries shown per nearby list. */
const EMERGENCY_MAX_NEARBY = 3;

/** Display labels for incident types (mirrors incidentService taxonomy). */
const INCIDENT_LABELS = {
	congestion: "Heavy traffic",
	accident: "Accident",
	hazard: "Road hazard",
	construction: "Road works",
	closure: "Road closure",
	lane_restriction: "Lane restriction",
	other: "Incident",
};

const RAIN_LIKE = /rain|thunder|drizzle|shower|storm/i;

/**
 * Resolve the best known position: live GPS first, then the planned route
 * start, then the destination. Returns { coord, label } or coord: null.
 */
export function resolveEmergencyLocation({ userCoord, sourceCoord, destCoord } = {}) {
	if (isValidCoord(userCoord)) return { coord: userCoord, label: "Current GPS position" };
	if (isValidCoord(sourceCoord)) return { coord: sourceCoord, label: "Route start point" };
	if (isValidCoord(destCoord)) return { coord: destCoord, label: "Destination" };
	return { coord: null, label: null };
}

/**
 * Active hazard reports near a coordinate, nearest first.
 * Fixed/rejected reports are excluded — they no longer affect the road.
 */
export function nearbyActiveReports(coord, reports = [], { range = EMERGENCY_NEARBY_RANGE_METERS, limit = EMERGENCY_MAX_NEARBY } = {}) {
	if (!isValidCoord(coord)) return [];
	const out = [];
	for (const r of reports) {
		if (!r || !isValidCoord(r.coord)) continue;
		if (!isActiveStatus(r.status)) continue;
		const d = distMeters(coord, r.coord);
		if (!Number.isFinite(d) || d > range) continue;
		out.push({
			id: r.id ?? null,
			distanceMeters: Math.round(d),
			type: hazardTypeMeta(r.type).label,
			severity: r.severity || "low",
			description: r.description || "",
		});
	}
	out.sort((a, b) => a.distanceMeters - b.distanceMeters || String(a.type).localeCompare(String(b.type)));
	return out.slice(0, limit);
}

/** Incidents near a coordinate, nearest first. */
export function nearbyIncidents(coord, incidents = [], { range = EMERGENCY_NEARBY_RANGE_METERS, limit = EMERGENCY_MAX_NEARBY } = {}) {
	if (!isValidCoord(coord)) return [];
	const out = [];
	for (const inc of incidents) {
		if (!inc || !isValidCoord(inc.coord)) continue;
		const d = distMeters(coord, inc.coord);
		if (!Number.isFinite(d) || d > range) continue;
		out.push({
			id: inc.id ?? null,
			distanceMeters: Math.round(d),
			type: INCIDENT_LABELS[inc.type] || inc.type || "Incident",
			severity: inc.severity || "low",
			description: inc.description || "",
		});
	}
	out.sort((a, b) => a.distanceMeters - b.distanceMeters);
	return out.slice(0, limit);
}

/**
 * Build the emergency context from data the app actually has.
 *
 * @param {Object} input
 * @param {Array|null} input.userCoord      live GPS position [lng, lat]
 * @param {Array|null} input.sourceCoord    route start [lng, lat]
 * @param {Array|null} input.destCoord      route destination [lng, lat]
 * @param {Array}      input.reports        stored hazard reports
 * @param {Array}      input.incidents      incidents for the selected route
 * @param {string[]}   input.weatherMains   weather main values already fetched ([])
 * @param {Array|null} input.routeCoords    selected route polyline (for distance-to-route)
 * @param {number}     input.now            epoch ms
 */
export function buildEmergencyContext({
	userCoord = null,
	sourceCoord = null,
	destCoord = null,
	reports = [],
	incidents = [],
	weatherMains = [],
	routeCoords = null,
	now = Date.now(),
} = {}) {
	const location = resolveEmergencyLocation({ userCoord, sourceCoord, destCoord });
	const hazards = nearbyActiveReports(location.coord, reports);
	const nearby = nearbyIncidents(location.coord, incidents);
	const weatherKnown = Array.isArray(weatherMains) && weatherMains.length > 0;
	let routeDistanceMeters = null;
	if (location.coord && Array.isArray(routeCoords) && routeCoords.length >= 2) {
		const d = pointLineDistMeters(location.coord, routeCoords);
		if (Number.isFinite(d)) routeDistanceMeters = Math.round(d);
	}
	return {
		location,
		locationKnown: Boolean(location.coord),
		hazards,
		incidents: nearby,
		routeDistanceMeters,
		isNight: isNightTime(new Date(now)),
		weather: {
			known: weatherKnown,
			rain: weatherKnown && weatherMains.some((m) => RAIN_LIKE.test(String(m || ""))),
			mains: weatherKnown ? weatherMains.map(String) : [],
		},
		capturedAt: now,
	};
}

/**
 * Fixed rule-based checklist. Each step carries a `why` so the user can see
 * exactly which condition put it on the list — nothing is inferred.
 * @returns {Array<{id:string,title:string,detail:string,why:string}>}
 */
export function emergencyChecklist(context = {}) {
	const {
		locationKnown = false,
		location = {},
		hazards = [],
		incidents = [],
		isNight = false,
		weather = {},
	} = context;
	const steps = [];

	steps.push({
		id: "safe-spot",
		title: "Move to a safe spot",
		detail: "Pull over clear of traffic, away from curves and gradients, before doing anything else.",
		why: "Always applies",
	});
	steps.push({
		id: "hazard-lights",
		title: "Switch on hazard lights",
		detail: "Use a warning triangle behind the vehicle if you have one and it is safe to place it.",
		why: "Always applies",
	});
	steps.push({
		id: "call",
		title: "Call 112 with your location ready",
		detail: "112 is the all-in-one national emergency number; use the call buttons above. Say the road name, landmark and your coordinates.",
		why: "Always applies",
	});

	if (locationKnown) {
		steps.push({
			id: "share-location",
			title: "Share your exact position",
			detail: `Your position: ${Number(location.coord?.[1]).toFixed(6)}, ${Number(location.coord?.[0]).toFixed(6)} (${location.label || "known point"}). Use "Copy location" above to paste it into a call or message.`,
			why: `Position known — ${location.label || "point on map"}`,
		});
	} else {
		steps.push({
			id: "share-location",
			title: "Get a position to share",
			detail: "No GPS position or route point is available yet — turn on location or set a start point, then copy the coordinates for responders.",
			why: "Location unknown — nothing is guessed for you",
		});
	}

	if (hazards.length) {
		const list = hazards.map((h) => `${h.type} (${h.severity}) ${h.distanceMeters} m`).join(", ");
		steps.push({
			id: "nearby-hazards",
			title: "Reported road hazards nearby",
			detail: `${hazards.length} active report(s) within ${EMERGENCY_NEARBY_RANGE_METERS} m of your position: ${list}. Mention them when you call.`,
			why: `${hazards.length} active stored report(s) within ${EMERGENCY_NEARBY_RANGE_METERS} m`,
		});
	}

	if (incidents.length) {
		const list = incidents.map((i) => `${i.type} ${i.distanceMeters} m`).join(", ");
		steps.push({
			id: "nearby-incidents",
			title: "Incidents on the selected route",
			detail: `${list}. These come from traffic data, route reports and the optional incident feed — verify before relying on them.`,
			why: `${incidents.length} incident(s) within ${EMERGENCY_NEARBY_RANGE_METERS} m`,
		});
	}

	if (isNight) {
		steps.push({
			id: "night",
			title: "Extra care at night",
			detail: `It is inside the fixed night window (${NIGHT_WINDOW.startHour}:00–${NIGHT_WINDOW.endHour}:00). Wear something visible, keep oncoming traffic in view and do not stand in the carriageway.`,
			why: `Time of day — inside the ${NIGHT_WINDOW.startHour}:00–${NIGHT_WINDOW.endHour}:00 window`,
		});
	}

	if (weather?.known && weather.rain) {
		steps.push({
			id: "rain",
			title: "Rain is on the fetched forecast",
			detail: "Fetched weather reports rain along the route — surfaces will be slippery and visibility reduced; allow extra stopping distance.",
			why: `Fetched weather: ${weather.mains.join(", ")}`,
		});
	} else if (weather?.known) {
		steps.push({
			id: "weather",
			title: "Fetched weather: no rain",
			detail: `Fetched weather along the route reads: ${weather.mains.join(", ")}.`,
			why: "Fetched weather — no rain signal",
		});
	}

	if (!hazards.length && !incidents.length) {
		steps.push({
			id: "no-data",
			title: "No nearby data — not a clearance",
			detail: `This app has no active reports or incidents within ${EMERGENCY_NEARBY_RANGE_METERS} m of your position. That only reflects stored app data, never an inspection of the road.`,
			why: "Honesty note: absence of reports is not absence of danger",
		});
	}

	return steps;
}

/**
 * Plain-text summary for the copy-to-clipboard action (share with responders).
 */
export function emergencyShareText(context = {}) {
	const { location = {}, hazards = [], incidents = [], isNight = false, weather = {}, capturedAt = Date.now() } = context;
	const lines = ["EMERGENCY LOCATION (STARS)"];
	if (location.coord) {
		lines.push(`Position: ${Number(location.coord[1]).toFixed(6)}, ${Number(location.coord[0]).toFixed(6)} (${location.label || "known point"})`);
	} else {
		lines.push("Position: unknown — no GPS or route point available");
	}
	lines.push(`Time: ${new Date(capturedAt).toISOString()}`);
	lines.push(`Night window: ${isNight ? "yes" : "no"}`);
	lines.push(`Weather fetched: ${weather?.known ? weather.mains.join(", ") : "no"}`);
	lines.push(
		hazards.length
			? `Active reports within ${EMERGENCY_NEARBY_RANGE_METERS} m: ${hazards.map((h) => `${h.type} (${h.severity}) ${h.distanceMeters} m`).join("; ")}`
			: `Active reports within ${EMERGENCY_NEARBY_RANGE_METERS} m: none stored`
	);
	lines.push(
		incidents.length
			? `Incidents nearby: ${incidents.map((i) => `${i.type} ${i.distanceMeters} m`).join("; ")}`
			: "Incidents nearby: none stored"
	);
	lines.push("Source: app-stored data only. Call 112 for real emergencies.");
	return lines.join("\n");
}

/** OpenStreetMap link for a coordinate (deterministic, no API key). */
export function openLocationLink(coord) {
	if (!isValidCoord(coord)) return null;
	const lat = Number(coord[1]).toFixed(6);
	const lng = Number(coord[0]).toFixed(6);
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}
