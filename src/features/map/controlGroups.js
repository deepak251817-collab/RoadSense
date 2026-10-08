/**
 * Map control grouping.
 *
 * The layer popover presents controls under four canonical groups —
 * Navigation, Safety, Hazards, Analytics. This module owns that canonical
 * order and a pure normalizer that validates arbitrary caller-supplied
 * groups: malformed items are dropped (never rendered half-broken),
 * duplicate labels are removed, empty groups disappear, and known group
 * titles sort into the canonical order while unknown ones trail behind in
 * their given order (so no control is ever silently lost).
 */

/** Canonical group titles, in display order. */
export const CONTROL_GROUP_ORDER = ["Navigation", "Safety", "Hazards", "Analytics"];

/** @param {unknown} v */
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

/** @param {unknown} v */
const isToggleItem = (v) =>
  v != null &&
  typeof v === "object" &&
  isNonEmptyString(v.label) &&
  typeof v.onChange === "function";

/**
 * Normalize caller-supplied control groups for rendering.
 *
 * @param {Array<{title:string, items:Array}>} groups
 * @returns {Array<{title:string, items:Array<{label:string, hint?:string, checked:boolean, onChange:Function}>}>}
 *   groups with at least one valid item, sorted by CONTROL_GROUP_ORDER,
 *   items de-duplicated by label (first occurrence wins)
 */
export function normalizeControlGroups(groups) {
  if (!Array.isArray(groups)) return [];

  const seenLabels = new Set();
  const normalized = [];

  groups.forEach((group, idx) => {
    if (group == null || typeof group !== "object") return;
    if (!isNonEmptyString(group.title)) return;
    const items = (Array.isArray(group.items) ? group.items : []).filter((item) => {
      if (!isToggleItem(item)) return false;
      const key = item.label.trim().toLowerCase();
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    });
    if (!items.length) return;
    const title = group.title.trim();
    const canonicalIdx = CONTROL_GROUP_ORDER.indexOf(title);
    normalized.push({
      title,
      items: items.map((item) => ({ ...item, checked: Boolean(item.checked) })),
      // known titles first in canonical order, unknown titles after (stable)
      order: canonicalIdx === -1 ? CONTROL_GROUP_ORDER.length + idx : canonicalIdx,
      seq: idx,
    });
  });

  normalized.sort((a, b) => a.order - b.order || a.seq - b.seq);
  return normalized.map(({ title, items }) => ({ title, items }));
}
