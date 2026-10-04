import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { formatAheadDistance } from "../utils/hazardAlerts";

/**
 * Fixed top-center stack of ahead-of-route hazard alerts.
 * Pure presentational: alerts + dismiss callback in, nothing else.
 */
export default function HazardAlertStack({ alerts = [], onDismiss }) {
  if (!alerts.length) return null;
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(94vw,460px)] space-y-2"
      aria-live="assertive"
      aria-label="Route hazard alerts"
    >
      {alerts.map((a) => {
        const critical =
          a.severity === "critical" || a.title === "ROAD CLOSURE" || a.title === "ACCIDENT";
        return (
          <div
            key={a.key}
            role="alert"
            className={`rounded-xl shadow-2xl border-2 px-4 py-3 flex items-start gap-3 backdrop-blur-md ${
              critical
                ? "bg-red-50/95 border-red-400 text-red-900 dark:bg-red-950/90 dark:border-red-700 dark:text-red-100"
                : "bg-amber-50/95 border-amber-400 text-amber-900 dark:bg-amber-950/90 dark:border-amber-600 dark:text-amber-100"
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${critical ? "text-red-600" : "text-amber-600"}`}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold tracking-wide">{a.title}</div>
              <div className="text-sm font-medium">{a.message}</div>
            </div>
            <div className="text-sm font-bold whitespace-nowrap">
              {formatAheadDistance(a.aheadMeters)} ahead
            </div>
            <button
              onClick={() => onDismiss(a.key)}
              aria-label={`Dismiss ${a.title} alert`}
              className="p-1 rounded hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-current"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
