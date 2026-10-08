/** P26 — map control grouping tests. */
import assert from "node:assert/strict";
import { CONTROL_GROUP_ORDER, normalizeControlGroups } from "./src/features/map/controlGroups.js";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
};

const item = (label) => ({ label, checked: true, onChange: () => {} });

t("canonical order covers the four groups", () => {
  assert.deepEqual(CONTROL_GROUP_ORDER, ["Navigation", "Safety", "Hazards", "Environment"]);
});

t("shuffled groups are sorted into canonical order", () => {
  const out = normalizeControlGroups([
    { title: "Environment", items: [item("Weather forecasts")] },
    { title: "Hazards", items: [item("Incidents")] },
    { title: "Navigation", items: [item("Live routing")] },
    { title: "Safety", items: [item("Road Risk")] },
  ]);
  assert.deepEqual(out.map((g) => g.title), ["Navigation", "Safety", "Hazards", "Environment"]);
});

t("every layer toggle survives normalization (real app config)", () => {
  const out = normalizeControlGroups([
    { title: "Navigation", items: [item("Live routing")] },
    { title: "Safety", items: [item("Road Risk"), item("Incidents"), item("Safety heatmap")] },
    { title: "Hazards", items: [item("Hazard markers"), item("Fixed potholes"), item("BBMP potholes")] },
    { title: "Environment", items: [item("Weather forecasts")] },
  ]);
  const flat = out.flatMap((g) => g.items.map((i) => i.label));
  assert.equal(out.length, 4);
  assert.equal(flat.length, 8);
  assert.deepEqual(flat.sort(), [
    "BBMP potholes", "Fixed potholes", "Hazard markers", "Incidents",
    "Live routing", "Road Risk", "Safety heatmap", "Weather forecasts",
  ].sort());
});

t("malformed items are dropped, never rendered", () => {
  const out = normalizeControlGroups([
    { title: "Hazards", items: [item("Good"), { label: "No handler" }, { checked: true }, null, "string"] },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].items.map((i) => i.label), ["Good"]);
});

t("duplicate labels keep the first occurrence only", () => {
  const second = { label: "Incidents", checked: false, onChange: () => {} };
  const out = normalizeControlGroups([
    { title: "Hazards", items: [item("Incidents"), second] },
    { title: "Safety", items: [item("incidents")] }, // case-insensitive dup across groups
  ]);
  const flat = out.flatMap((g) => g.items);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].checked, true); // first wins
});

t("empty or invalid groups disappear", () => {
  const out = normalizeControlGroups([
    { title: "Navigation", items: [] },
    { title: "Safety" },
    { title: "", items: [item("x")] },
    null,
    { title: "Hazards", items: [item("Keep me")] },
  ]);
  assert.deepEqual(out.map((g) => g.title), ["Hazards"]);
});

t("unknown group titles trail the canonical ones, in input order", () => {
  const out = normalizeControlGroups([
    { title: "Experimental", items: [item("Beta layer")] },
    { title: "Navigation", items: [item("Live routing")] },
    { title: "Extra", items: [item("Another beta")] },
  ]);
  assert.deepEqual(out.map((g) => g.title), ["Navigation", "Experimental", "Extra"]);
});

t("checked values are coerced to booleans", () => {
  const out = normalizeControlGroups([
    { title: "Safety", items: [{ label: "A", checked: 1, onChange: () => {} }, { label: "B", onChange: () => {} }] },
  ]);
  assert.deepEqual(out[0].items.map((i) => i.checked), [true, false]);
});

t("non-array input normalizes to an empty list", () => {
  assert.deepEqual(normalizeControlGroups(null), []);
  assert.deepEqual(normalizeControlGroups(undefined), []);
  assert.deepEqual(normalizeControlGroups("groups"), []);
});

console.log(`\n${passed} tests passed`);
