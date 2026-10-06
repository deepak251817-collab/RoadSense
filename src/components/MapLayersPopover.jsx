import React from "react";
import { Layers } from "lucide-react";

/**
 * On-map layer visibility popover. Pure presentational: the caller owns
 * each toggle's state and passes it as `layers` (upper area) and
 * `lower` (lower area — forecast/live quick controls).
 *
 * @param {Object} props
 * @param {boolean} props.open popover visibility
 * @param {Function} props.onToggle toggle handler
 * @param {boolean} props.bbmpLoaded whether BBMP data is loaded (hint)
 * @param {Array<{label:string, checked:boolean, onChange:Function}>} props.layers
 * @param {Array<{label:string, hint?:string, checked:boolean, onChange:Function}>} props.lower lower-area controls
 */
export default function MapLayersPopover({ open, onToggle, bbmpLoaded, layers = [], lower = [] }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Map layers"
        title="Map layers"
        className="px-3 py-2 rounded-xl text-sm font-semibold bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-2 border-gray-200 dark:border-gray-700 hover:bg-white hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl transition-all duration-300"
      >
        <Layers className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-60 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-xl p-3 z-30"
          role="group"
          aria-label="Layer visibility"
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            Layers
          </div>
          {layers.map((l) => (
            <label
              key={l.label}
              className="flex items-center justify-between gap-2 text-xs py-1.5 cursor-pointer text-gray-700 dark:text-gray-200"
            >
              <span>{l.label}</span>
              <input
                type="checkbox"
                checked={l.checked}
                onChange={(e) => l.onChange(e.target.checked)}
                className="w-4 h-4 rounded"
              />
            </label>
          ))}
          {!bbmpLoaded && (
            <div className="mt-1 text-[10px] text-gray-400">
              BBMP layer appears after loading civic data.
            </div>
          )}
          {lower.length > 0 && (
            <div className="mt-2 pt-2 border-t-2 border-dashed border-gray-200 dark:border-gray-700">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Forecast &amp; live
              </div>
              {lower.map((l) => (
                <label
                  key={l.label}
                  className="flex items-start justify-between gap-2 py-1.5 cursor-pointer text-gray-700 dark:text-gray-200"
                >
                  <span>
                    <span className="text-xs font-medium">{l.label}</span>
                    {l.hint && (
                      <span className="block text-[10px] leading-tight text-gray-400 dark:text-gray-500">{l.hint}</span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={l.checked}
                    onChange={(e) => l.onChange(e.target.checked)}
                    className="w-4 h-4 rounded mt-0.5"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
