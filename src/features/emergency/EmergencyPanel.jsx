import React, { useEffect, useRef, useState } from "react";
import { Siren, Phone, Copy, MapPin, ExternalLink, Navigation } from "lucide-react";
import {
  EMERGENCY_LABEL,
  EMERGENCY_DISCLAIMER,
  EMERGENCY_NUMBERS,
  EMERGENCY_NEARBY_RANGE_METERS,
  emergencyChecklist,
  emergencyShareText,
  openLocationLink,
} from "./emergencyMode";
import {
  EMERGENCY_SERVICES_LABEL,
  EMERGENCY_SERVICES_DISCLAIMER,
  SERVICES_RADIUS_METERS,
  fetchEmergencyServices,
} from "./emergencyServices";

const SEVERITY_TEXT = {
  critical: "text-red-700 dark:text-red-300",
  high: "text-red-600 dark:text-red-400",
  moderate: "text-amber-600 dark:text-amber-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-gray-600 dark:text-gray-400",
};

/**
 * Emergency assistance panel (rule-based).
 *
 * Shows public India emergency numbers as tel: links, the best known
 * position with copy/open-map actions, an ordered rule-based checklist
 * where every step discloses why it appears, and the nearest stored
 * reports/incidents with real measured distances.
 *
 * @param {Object} props
 * @param {boolean} props.show panel visibility
 * @param {Object} props.context output of buildEmergencyContext()
 * @param {Function} props.onClose hide the panel
 * @param {Function} [props.onServicesFound] hand fetched services to the app (map display)
 * @param {Function} [props.onNavigateTo] set a service as the navigation destination
 */
export default function EmergencyPanel({ show, context, onClose, onServicesFound, onNavigateTo }) {
  const [copied, setCopied] = useState(null); // "coords" | "summary" | "failed"
  const copyTimerRef = useRef(null);
  // Nearby emergency services (live OpenStreetMap Overpass fetch, on demand)
  const [services, setServices] = useState(null); // null | {loading:true} | {ok, services, error, fetchedAt, cached}

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  if (!show || !context) return null;

  const { location, locationKnown, hazards, incidents, routeDistanceMeters } = context;
  const coord = location.coord;
  const osmLink = openLocationLink(coord);
  const checklist = emergencyChecklist(context);

  const searchServices = async () => {
    if (!locationKnown) return;
    setServices({ loading: true });
    const res = await fetchEmergencyServices(coord);
    setServices({
      ok: res.ok,
      services: res.services,
      error: res.error || null,
      cached: Boolean(res.cached),
      fetchedAt: res.fetchedAt,
    });
    // Hand results (or an empty list on failure) to the app for map display
    onServicesFound?.(res.ok ? res.services : []);
  };

  const copyText = async (key, text) => {
    clearTimeout(copyTimerRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied("failed");
    }
    copyTimerRef.current = setTimeout(() => setCopied(null), 2500);
  };

  const coordText = coord ? `${Number(coord[1]).toFixed(6)}, ${Number(coord[0]).toFixed(6)}` : null;

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-900/20 p-4"
      role="region"
      aria-label="Emergency assistance"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 inline-flex items-center gap-2">
          <Siren className="w-4 h-4" aria-hidden="true" /> Emergency assistance
        </h3>
        <button onClick={onClose} className="text-xs text-red-700 dark:text-red-300 underline">
          Hide
        </button>
      </div>
      <div className="mb-3 inline-flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white">
          {EMERGENCY_LABEL}
        </span>
        <span className="text-[11px] text-red-700 dark:text-red-300">{EMERGENCY_DISCLAIMER}</span>
      </div>

      {/* Public emergency numbers (tel: links) */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {EMERGENCY_NUMBERS.map((n) => (
          <a
            key={n.id}
            href={`tel:${n.number}`}
            className="flex items-center gap-2 rounded-xl border-2 border-red-500 bg-white dark:bg-gray-900 px-3 py-2 hover:bg-red-600 hover:text-white transition-colors group"
          >
            <Phone className="w-4 h-4 text-red-600 group-hover:text-white" aria-hidden="true" />
            <span className="leading-tight">
              <span className="block text-sm font-bold">{n.number}</span>
              <span className="block text-[10px] text-gray-500 group-hover:text-red-100">
                {n.label} · {n.note}
              </span>
            </span>
          </a>
        ))}
      </div>

      {/* Position */}
      <div className="mb-3 rounded-xl bg-white/80 dark:bg-gray-900/70 border border-red-200 dark:border-red-800 p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-800 dark:text-red-200 mb-1">
          <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Your position
        </div>
        {locationKnown ? (
          <>
            <div className="text-xs text-gray-800 dark:text-gray-100 font-mono">
              {coordText} <span className="font-sans text-gray-500 dark:text-gray-400">({location.label})</span>
            </div>
            {routeDistanceMeters != null && (
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {routeDistanceMeters} m from the selected route (straight line)
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-1.5">
              <button
                onClick={() => copyText("coords", coordText)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-[11px] hover:bg-red-600 hover:text-white hover:border-red-600"
              >
                <Copy className="w-3 h-3" aria-hidden="true" /> Copy coordinates
              </button>
              <button
                onClick={() => copyText("summary", emergencyShareText(context))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-[11px] hover:bg-red-600 hover:text-white hover:border-red-600"
              >
                <Copy className="w-3 h-3" aria-hidden="true" /> Copy full summary
              </button>
              {osmLink && (
                <a
                  href={osmLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-[11px] hover:bg-red-600 hover:text-white hover:border-red-600"
                >
                  <ExternalLink className="w-3 h-3" aria-hidden="true" /> Open map
                </a>
              )}
            </div>
            {copied && (
              <div className="mt-1 text-[10px] text-green-700 dark:text-green-400" role="status">
                {copied === "failed" ? "Clipboard unavailable — select and copy manually" : "Copied to clipboard"}
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-gray-600 dark:text-gray-300">
            No GPS position or route point yet. Turn on <strong>My location</strong> or set a start
            point — nothing is guessed for you.
          </div>
        )}
      </div>

      {/* Rule-based checklist */}
      <div className="mb-3">
        <div className="text-[11px] font-semibold text-red-800 dark:text-red-200 mb-1">
          What to do (ordered checklist)
        </div>
        <ol className="space-y-1.5">
          {checklist.map((step) => (
            <li key={step.id} className="rounded-lg bg-white/80 dark:bg-gray-900/70 border border-red-200 dark:border-red-800 p-2">
              <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">{step.title}</div>
              <div className="text-[11px] text-gray-600 dark:text-gray-300">{step.detail}</div>
              <div className="mt-0.5 text-[10px] text-red-700 dark:text-red-300">Why: {step.why}</div>
            </li>
          ))}
        </ol>
      </div>

      {/* Nearby real data */}
      <div className="text-[11px] font-semibold text-red-800 dark:text-red-200 mb-1">
        Nearby data (within {EMERGENCY_NEARBY_RANGE_METERS} m, straight line)
      </div>
      {hazards.length === 0 && incidents.length === 0 ? (
        <div className="text-[11px] text-gray-600 dark:text-gray-300">
          No active reports or incidents stored near this position. This is app data only — not a
          clearance of the road.
        </div>
      ) : (
        <ul className="space-y-1">
          {hazards.map((h, i) => (
            <li key={`h-${i}`} className="text-[11px] text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <span className="font-bold text-red-600 dark:text-red-400">{h.distanceMeters} m</span>
              <span>{h.type}</span>
              <span className={`uppercase text-[10px] font-bold ${SEVERITY_TEXT[h.severity] || SEVERITY_TEXT.low}`}>{h.severity}</span>
              {h.description && <span className="text-gray-500 dark:text-gray-400 truncate">— {h.description}</span>}
            </li>
          ))}
          {incidents.map((i2, i) => (
            <li key={`i-${i}`} className="text-[11px] text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <span className="font-bold text-amber-600 dark:text-amber-400">{i2.distanceMeters} m</span>
              <span>{i2.type}</span>
              <span className={`uppercase text-[10px] font-bold ${SEVERITY_TEXT[i2.severity] || SEVERITY_TEXT.low}`}>{i2.severity}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Nearby emergency services (live OpenStreetMap fetch, on demand) */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-semibold text-red-800 dark:text-red-200">
            Nearby emergency services (within {Math.round(SERVICES_RADIUS_METERS / 1000)} km)
          </div>
          <button
            onClick={searchServices}
            disabled={!locationKnown || Boolean(services?.loading)}
            className="rounded-lg border border-red-400 px-2 py-1 text-[11px] text-red-700 dark:text-red-300 hover:bg-red-600 hover:text-white hover:border-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {services?.loading ? "Searching…" : services && !services.loading ? "Refresh" : "Search nearby"}
          </button>
        </div>
        <div className="mb-1 inline-flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-700 text-white">
            {EMERGENCY_SERVICES_LABEL}
          </span>
          <span className="text-[10px] text-red-700 dark:text-red-300">{EMERGENCY_SERVICES_DISCLAIMER}</span>
        </div>
        {!locationKnown && (
          <div className="text-[10px] text-gray-600 dark:text-gray-300">
            Needs a known position — nothing is searched or guessed until you have one.
          </div>
        )}
        {services && !services.loading && !services.ok && (
          <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 text-[11px] text-amber-800 dark:text-amber-200" role="status">
            {services.error} This is a fetch failure — it does not mean no services exist nearby.
          </div>
        )}
        {services && !services.loading && services.ok && services.services.length === 0 && (
          <div className="text-[10px] text-gray-600 dark:text-gray-300" role="status">
            No matching services found in OpenStreetMap within {Math.round(SERVICES_RADIUS_METERS / 1000)} km — that
            reflects map coverage, not a real-world absence. Call 112 anyway.
          </div>
        )}
        {services && !services.loading && services.ok && services.services.length > 0 && (
          <ul className="space-y-1">
            {services.services.map((s) => (
              <li key={s.id} className="text-[11px] text-gray-800 dark:text-gray-200 flex items-center gap-2 flex-wrap">
                <span className="font-bold text-red-600 dark:text-red-400">
                  {s.distanceMeters >= 1000 ? `${(s.distanceMeters / 1000).toFixed(1)} km` : `${s.distanceMeters} m`}
                </span>
                <span className="font-semibold">{s.name}</span>
                <span className="px-1 rounded bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 text-[9px] uppercase font-bold">
                  {s.category}
                </span>
                {s.openingHours && <span className="text-gray-500 dark:text-gray-400 text-[10px]">{s.openingHours}</span>}
                {s.phone && (
                  <a href={`tel:${s.phone}`} className="text-red-700 dark:text-red-300 underline font-semibold">
                    {s.phone}
                  </a>
                )}
                {onNavigateTo && (
                  <button
                    onClick={() => onNavigateTo(s.coord, s.name)}
                    className="inline-flex items-center gap-1 rounded border border-red-400 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-600 hover:text-white hover:border-red-600"
                    title={`Plan a route to ${s.name}`}
                  >
                    <Navigation className="w-3 h-3" aria-hidden="true" /> Directions
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
