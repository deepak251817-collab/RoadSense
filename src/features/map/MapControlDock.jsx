import React, { useState } from "react";

/**
 * Map intelligence control dock (UI Phase 3).
 *
 * Replaces the old flat row of ~16 controls with five logical groups —
 * Navigation, Safety, Hazards, Environment, Analytics. Collapsed by
 * default (one row of group buttons); clicking a group expands only its
 * controls, so the map is never buried under every control at once.
 *
 * Pure presentational: every item's state and handler is supplied by the
 * caller (App.jsx) — this component only renders and reports clicks.
 * Active items are highlighted AND carry aria-pressed; group buttons show
 * an active-count badge so live layers stay visible while collapsed.
 *
 * @param {Object} props
 * @param {Array} props.groups Groups: { key, label, icon, items }
 *   Items: { key, label, icon?, active?, disabled?, hint?, onClick? }
 *   or    { key, type: "custom", render: () => node }
 */
export default function MapControlDock({ groups }) {
  const [openKey, setOpenKey] = useState(null);

  if (!Array.isArray(groups) || !groups.length) return null;
  const openGroup = groups.find((g) => g.key === openKey) || null;

  return (
    <nav className="stars-card p-1.5" aria-label="Map intelligence controls">
      {/* Collapsed state: group buttons with active counts */}
      <div className="flex flex-wrap gap-1">
        {groups.map((g) => {
          const Icon = g.icon;
          const activeCount = g.items.filter((it) => it.active).length;
          const isOpen = openKey === g.key;
          return (
            <button
              key={g.key}
              type="button"
              aria-expanded={isOpen}
              aria-controls={`map-dock-${g.key}`}
              data-tip={activeCount ? `${g.label}: ${activeCount} active` : g.label}
              onClick={() => setOpenKey(isOpen ? null : g.key)}
              className={`stars-btn text-xs ${
                isOpen
                  ? "bg-primary-600 text-white hover:bg-primary-700"
                  : activeCount
                    ? "bg-primary-50 text-primary-700 border border-primary-300 dark:bg-primary-900/40 dark:text-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/60"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
              <span>{g.label}</span>
              {activeCount > 0 && (
                <span
                  className={`px-1.5 rounded-full text-[10px] font-bold ${
                    isOpen ? "bg-white/25 text-white" : "bg-primary-600 text-white"
                  }`}
                >
                  {activeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded state: only the selected group's controls */}
      {openGroup && (
        <div
          id={`map-dock-${openGroup.key}`}
          className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-1.5"
        >
          <span className="stars-label mr-1">{openGroup.title || openGroup.label}</span>
          {openGroup.items.map((it) => {
            if (it.type === "custom") {
              return (
                <div key={it.key} className="inline-flex items-center gap-3 px-2 py-1">
                  {it.render()}
                </div>
              );
            }
            const Icon = it.icon;
            return (
              <button
                key={it.key}
                type="button"
                onClick={it.onClick}
                disabled={Boolean(it.disabled)}
                aria-pressed={Boolean(it.active)}
                data-tip={it.hint || it.label}
                className={`inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                  it.active
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                {it.label}
              </button>
            );
          })}
          {typeof openGroup.note === "string" && openGroup.note && (
            <span className="stars-caption ml-1">{openGroup.note}</span>
          )}
        </div>
      )}
    </nav>
  );
}
