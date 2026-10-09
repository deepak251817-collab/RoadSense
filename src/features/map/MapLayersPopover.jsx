import React from "react";
import { Layers } from "lucide-react";
import { normalizeControlGroups } from "./controlGroups";

/**
 * On-map layer visibility popover. Pure presentational: the caller owns
 * each toggle's state and passes it as `groups` — one entry per control
 * group (Navigation / Safety / Hazards / Analytics). Groups are validated
 * and canonically ordered by normalizeControlGroups() before rendering.
 *
 * @param {Object} props
 * @param {boolean} props.open popover visibility
 * @param {Function} props.onToggle toggle handler
 * @param {boolean} props.bbmpLoaded whether BBMP data is loaded (hint)
 * @param {Array<{title:string, items:Array<{label:string, hint?:string, checked:boolean, onChange:Function}>}>} props.groups
 */
export default function MapLayersPopover({ open, onToggle, bbmpLoaded, groups = [] }) {
  const rendered = normalizeControlGroups(groups);
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Map layers"
        title="Map layers"
        className="px-3 py-2 rounded-control text-sm font-semibold bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200 dark:border-gray-700 hover:bg-white shadow-pop transition-colors duration-150"
      >
        <Layers className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-xl p-3 z-30"
          role="group"
          aria-label="Layer visibility"
        >
          {rendered.map((group, gi) => (
            <div
              key={group.title}
              role="group"
              aria-label={`${group.title} controls`}
              className={gi > 0 ? "mt-2 pt-2 border-t-2 border-dashed border-gray-200 dark:border-gray-700" : undefined}
            >
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                {group.title}
              </div>
              {group.items.map((l) => (
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
          ))}
          {!bbmpLoaded && (
            <div className="mt-2 text-[10px] text-gray-400">
              BBMP layer appears after loading civic data.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
