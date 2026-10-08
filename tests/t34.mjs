// Phase 23 — municipal dashboard engine: location filter, critical roads,
// deteriorating areas. Pure-module suite (temp harness rewrites imports).
import { strict as assert } from "node:assert";
import {
  summarizeMunicipal,
  applyReportFilters,
  gridCellKey,
  gridCellLabel,
  locationOptions,
  LOCATION_GRID_DEG,
  MUNICIPAL_FILTERS,
} from "./src/features/admin/municipalSummary.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function report(over = {}) {
  return {
    id: over.id ?? 1,
    coord: [77.62, 12.97],
    severity: "moderate",
    type: "pothole",
    status: "reported",
    createdAt: NOW - 2 * HOUR,
    description: "test",
    hiddenGlobally: false,
    hiddenForUser: false,
    ...over,
  };
}

// --- gridCellKey / gridCellLabel ------------------------------------------
test("gridCellKey buckets coordinates onto the 0.05° grid", () => {
  assert.equal(gridCellKey([77.62, 12.97]), gridCellKey([77.6201, 12.9701]));
  assert.notEqual(gridCellKey([77.62, 12.97]), gridCellKey([77.68, 13.02]));
  assert.equal(gridCellKey([0.01, 0.01]), gridCellKey([0.02, 0.02]));
  assert.equal(gridCellKey([-77.62, -12.97]), gridCellKey([-77.621, -12.971]));
});

test("gridCellKey rejects invalid coordinates instead of inventing a cell", () => {
  assert.equal(gridCellKey(null), null);
  assert.equal(gridCellKey([]), null);
  assert.equal(gridCellKey([77.62]), null);
  assert.equal(gridCellKey(["x", "y"]), null);
  assert.equal(gridCellKey([NaN, 12.97]), null);
});

test("gridCellLabel prints the real coordinate window (no place names)", () => {
  const key = gridCellKey([77.62, 12.97]);
  const label = gridCellLabel(key);
  assert.match(label, /12\.95–13\.00° lat/);
  assert.match(label, /77\.60–77\.65° lng/);
  assert.equal(gridCellLabel(null), "Unknown area");
  assert.equal(gridCellLabel("garbage"), "Unknown area");
});

test("grid constants: location grid matches the exported degree", () => {
  assert.equal(LOCATION_GRID_DEG, 0.05);
});

// --- locationOptions -------------------------------------------------------
test("locationOptions derives choices only from cells that hold reports", () => {
  const opts = locationOptions([
    report({ id: 1, coord: [77.62, 12.97] }),
    report({ id: 2, coord: [77.62, 12.97] }), // same cell → one option
    report({ id: 3, coord: [77.68, 13.02] }), // different cell
    report({ id: 4, coord: null }), // invalid → no option
    report({ id: 5, coord: [77.62, 12.97], hiddenGlobally: true }), // hidden → no option
  ]);
  assert.equal(opts[0].value, "all");
  assert.equal(opts.length, 3); // all + 2 distinct cells
  assert.equal(new Set(opts.map((o) => o.value)).size, opts.length, "no duplicate values");
  for (const o of opts.slice(1)) assert.ok(o.label.includes("° lat"), "labels are coordinate windows");
});

test("locationOptions tolerates garbage input", () => {
  assert.deepEqual(locationOptions(), [{ value: "all", label: "Any location" }]);
  assert.deepEqual(locationOptions(null), [{ value: "all", label: "Any location" }]);
  assert.deepEqual(locationOptions([{}]), [{ value: "all", label: "Any location" }]);
});

// --- applyReportFilters: location -----------------------------------------
test("applyReportFilters location filters to one grid cell", () => {
  const cellA = [77.62, 12.97];
  const cellB = [77.68, 13.02];
  const reports = [
    report({ id: 1, coord: cellA }),
    report({ id: 2, coord: cellA }),
    report({ id: 3, coord: cellB }),
  ];
  const out = applyReportFilters(reports, { location: gridCellKey(cellA) }, NOW);
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => gridCellKey(r.coord) === gridCellKey(cellA)));
});

test("applyReportFilters location 'all' and unknown cells behave conservatively", () => {
  const reports = [report({ id: 1 }), report({ id: 2, coord: [77.68, 13.02] })];
  assert.equal(applyReportFilters(reports, { location: "all" }, NOW).length, 2);
  assert.equal(applyReportFilters(reports, {}, NOW).length, 2);
  // A cell that exists in the dropdown but has no reports now → empty result, no crash
  const ghost = gridCellKey([10, 10]);
  assert.equal(applyReportFilters(reports, { location: ghost }, NOW).length, 0);
});

test("applyReportFilters location composes with severity/type/status/priority", () => {
  const cell = [77.62, 12.97];
  const other = [77.68, 13.02];
  const reports = [
    report({ id: 1, coord: cell, severity: "high", type: "waterlogging" }),
    report({ id: 2, coord: cell, severity: "low" }),
    report({ id: 3, coord: other, severity: "high", type: "waterlogging" }),
  ];
  const out = applyReportFilters(
    reports,
    { location: gridCellKey(cell), severity: "high", type: "waterlogging" },
    NOW
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 1);
});

test("MUNICIPAL_FILTERS still exposes the five original filter groups", () => {
  for (const key of ["date", "severity", "type", "status", "priority"]) {
    assert.ok(Array.isArray(MUNICIPAL_FILTERS[key]) && MUNICIPAL_FILTERS[key].length > 1, key);
    assert.equal(MUNICIPAL_FILTERS[key][0].value, "all", key);
  }
});

// --- summarizeMunicipal: critical roads -----------------------------------
test("summary.critical lists active high/critical hazards worst-first", () => {
  const summary = summarizeMunicipal({
    reports: [
      report({ id: 1, severity: "high", createdAt: NOW - 3 * HOUR }),
      report({ id: 2, severity: "critical", createdAt: NOW - 1 * HOUR }),
      report({ id: 3, severity: "low" }),
      report({ id: 4, severity: "moderate" }),
      report({ id: 5, severity: "high", status: "fixed" }), // not active → excluded
      report({ id: 6, severity: "critical", hiddenForUser: true }), // hidden → excluded
    ],
    snapshots: [],
    now: NOW,
  });
  assert.equal(summary.critical.length, 2);
  assert.equal(summary.critical[0].report.id, 2, "critical ranks before high");
  assert.equal(summary.critical[1].report.id, 1);
  assert.ok(summary.critical[0].area.includes("° lat"), "area label present");
});

test("summary.critical is empty when nothing active is high/critical", () => {
  const summary = summarizeMunicipal({ reports: [report({ severity: "low" })], now: NOW });
  assert.deepEqual(summary.critical, []);
});

// --- summarizeMunicipal: deteriorating areas ------------------------------
test("areas reports insufficient history without baseline", () => {
  const summary = summarizeMunicipal({ reports: [report()], snapshots: [], now: NOW });
  assert.equal(summary.areas.insufficientHistory, true);
  assert.ok(summary.areas.reason.length > 0);
  assert.deepEqual(summary.areas.items, []);
  assert.equal(summary.areas.label, "Report-based comparison");
});

test("areas flags cells as deteriorating/improving/stable vs baseline", () => {
  const cellA = [77.62, 12.97];
  const cellB = [77.68, 13.02];
  const cellC = [77.75, 13.08];
  const baseline = {
    at: NOW - 48 * HOUR,
    dateKey: "old",
    activeIds: ["100", "200", "300"],
  };
  const reports = [
    // cell A: baseline id 100 still active + NEW id 200... wait: 200 also baseline.
    report({ id: 100, coord: cellA }), // unchanged (stable → filtered out unless other churn in cell)
    report({ id: 200, coord: cellA, status: "fixed" }), // resolved in A, plus a new one:
    report({ id: 300, coord: cellB }), // baseline still active in B
    report({ id: 400, coord: cellB }), // NEW hazard in B → deteriorating
    report({ id: 500, coord: cellC }), // NEW hazard in C
    report({ id: 600, coord: cellC }), // NEW hazard in C
  ];
  const summary = summarizeMunicipal({ reports, snapshots: [baseline], now: NOW });
  assert.equal(summary.areas.insufficientHistory, false);
  assert.equal(summary.areas.baselineAt, baseline.at);
  const byCell = new Map(summary.areas.items.map((i) => [i.cell, i]));

  const a = byCell.get(gridCellKey(cellA));
  assert.equal(a.newHazards, 0);
  assert.equal(a.resolvedHazards, 1);
  assert.equal(a.direction, "improving");

  const b = byCell.get(gridCellKey(cellB));
  assert.equal(b.newHazards, 1);
  assert.equal(b.resolvedHazards, 0);
  assert.equal(b.direction, "deteriorating");

  const c = byCell.get(gridCellKey(cellC));
  assert.equal(c.newHazards, 2);
  assert.equal(c.direction, "deteriorating");

  // deteriorating areas sort before improving ones
  assert.equal(summary.areas.items[0].direction, "deteriorating");
  assert.equal(summary.areas.items[summary.areas.items.length - 1].direction, "improving");
});

test("areas omits cells with no churn since baseline", () => {
  const cell = [77.62, 12.97];
  const baseline = { at: NOW - 48 * HOUR, dateKey: "old", activeIds: ["1"] };
  const summary = summarizeMunicipal({
    reports: [report({ id: 1, coord: cell })], // same report, still active
    snapshots: [baseline],
    now: NOW,
  });
  assert.equal(summary.areas.insufficientHistory, false);
  assert.deepEqual(summary.areas.items, []);
});

test("areas tolerates baseline ids whose reports were deleted (cell unknown)", () => {
  const cell = [77.62, 12.97];
  const baseline = { at: NOW - 48 * HOUR, dateKey: "old", activeIds: ["1", "999"] };
  const summary = summarizeMunicipal({
    reports: [report({ id: 1, coord: cell, status: "fixed" })], // 999 no longer stored
    snapshots: [baseline],
    now: NOW,
  });
  const item = summary.areas.items.find((i) => i.cell === gridCellKey(cell));
  assert.ok(item);
  assert.equal(item.resolvedHazards, 1, "only the known-cell resolution counted");
});

test("summary still exposes every pre-existing section key", () => {
  const summary = summarizeMunicipal({ reports: [report()], snapshots: [], now: NOW });
  for (const key of ["label", "kpi", "byType", "lifecycle", "topPriorities", "health", "trend", "reasons", "critical", "areas"]) {
    assert.ok(key in summary, `missing ${key}`);
  }
  assert.equal(summary.label, "Report-based summary");
});

console.log(`\nt34: ${passed}/${passed} passed`);
