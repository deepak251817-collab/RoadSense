/**
 * Phase 23 — Persistent hazard data services tests.
 * Run from a tmp harness dir containing ./services and ./utils.
 */
import assert from "node:assert/strict";
import {
  ADMIN_SESSION_KEY,
  AdminRequiredError,
  endAdminSession,
  getAdminSessionToken,
  getHazards,
  getRepairPriority,
  getRoadHealth,
  getRouteIntelligence,
  loadHazards,
  patchHazard,
  postHazard,
  replaceHazards,
  requireAdminSession,
  setHazardVerification,
  startAdminSession,
} from "./services/hazardService.js";
import { API_ENDPOINTS, DOMAINS } from "./services/backend.js";

let passed = 0;
async function t(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
};

const tests = [];

tests.push(async () => {
  const storage = memoryStorage();
  assert.deepEqual(loadHazards(storage), []);
  storage.setItem("userPotholeReports", "not-json");
  assert.deepEqual(loadHazards(storage), []);
  storage.setItem("userPotholeReports", JSON.stringify([{ id: "a" }, null, 42, { id: "b" }]));
  assert.deepEqual(loadHazards(storage).map((r) => r.id), ["a", "b"]);
});

tests.push(async () => {
  const storage = memoryStorage();
  assert.equal(replaceHazards([{ id: "x", type: "pothole" }, null], storage), true);
  assert.equal(loadHazards(storage).length, 1);
  assert.equal(JSON.parse(storage.getItem("userPotholeReports"))[0].id, "x");
  assert.equal(replaceHazards("not-an-array", storage), true);
  assert.equal(loadHazards(storage).length, 0);

  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
  assert.equal(replaceHazards([{ id: "y" }], broken), false);
});

tests.push(async () => {
  const storage = memoryStorage();
  const opts = { storage };
  const created = await postHazard({ type: "pothole", severity: "high", coord: [77.6, 12.97] }, opts);
  assert.ok(created.id);
  const list = await getHazards(opts);
  assert.equal(list.length, 1);
  const patched = await patchHazard(created.id, { severity: "low" }, opts);
  assert.equal(patched.severity, "low");
  assert.equal((await getHazards(opts))[0].severity, "low");
  await assert.rejects(() => postHazard(null, opts), /record is required/);
  await assert.rejects(() => patchHazard("missing", { severity: "high" }, opts), /not found/);
});

tests.push(async () => {
  endAdminSession();
  assert.equal(getAdminSessionToken(), null);
  assert.equal(ADMIN_SESSION_KEY, "starsAdminSession");

  const storage = memoryStorage();
  const opts = { storage };
  const h = await postHazard({ type: "pothole", severity: "high" }, opts);

  // Administrative writes are refused without an admin session.
  await assert.rejects(() => patchHazard(h.id, { status: "verified" }, { ...opts, admin: true }), AdminRequiredError);
  await assert.rejects(() => setHazardVerification(h.id, { status: "verified" }, opts), AdminRequiredError);
  assert.equal((await getHazards(opts))[0].status, undefined);

  // With a session the verification PATCH goes through.
  const token = startAdminSession();
  assert.equal(getAdminSessionToken(), token);
  const verified = await setHazardVerification(h.id, { status: "verified", severity: "moderate", notes: ["checked"] }, opts);
  assert.equal(verified.status, "verified");
  assert.equal(verified.severity, "moderate");
  assert.deepEqual(verified.adminNotes, ["checked"]);

  endAdminSession();
  assert.equal(getAdminSessionToken(), null);
  await assert.rejects(() => setHazardVerification(h.id, { status: "fixed" }, opts), AdminRequiredError);
  // Public (non-admin) edits still work without a session.
  const publicPatch = await patchHazard(h.id, { description: "updated" }, opts);
  assert.equal(publicPatch.description, "updated");
});

tests.push(async () => {
  const empty = await getRoadHealth({ reports: [] });
  assert.equal(empty.endpoint, "GET /road-health");
  assert.equal(empty.label, "Report-based index");
  assert.equal(empty.index, null);
  assert.equal(empty.confidence.label, "Insufficient Data");

  const reports = [
    { id: "1", severity: "high", status: "verified", type: "pothole", createdAt: Date.now() },
    { id: "2", severity: "moderate", status: "reported", type: "broken-road", createdAt: Date.now() },
    { id: "3", severity: "low", status: "fixed", type: "pothole", createdAt: Date.now() },
  ];
  const health = await getRoadHealth({ reports });
  assert.equal(typeof health.index, "number");
  assert.ok(health.index >= 0 && health.index <= 100);
  assert.ok(health.counts.total >= 3);
});

tests.push(async () => {
  const storage = memoryStorage();
  storage.setItem(
    "userPotholeReports",
    JSON.stringify([
      { id: "a", severity: "high", status: "verified", type: "pothole", createdAt: Date.now() - 86400000, coord: [77.6, 12.97] },
      { id: "b", severity: "low", status: "reported", type: "pothole", createdAt: Date.now(), coord: [77.61, 12.98] },
      { id: "c", severity: "moderate", status: "fixed", type: "pothole", createdAt: Date.now(), coord: [77.62, 12.99] },
    ])
  );
  const result = await getRepairPriority({ storage });
  assert.equal(result.endpoint, "GET /repair-priority");
  assert.equal(result.label, "Report-based priority");
  assert.ok(result.items.length >= 2); // fixed reports are not eligible
  assert.equal(result.items[0].rank, 1);
  assert.ok(result.items[0].score >= result.items[1].score);
  assert.equal(result.count, result.items.length);
});

tests.push(async () => {
  const none = await getRouteIntelligence();
  assert.equal(none.endpoint, "GET /route-intelligence");
  assert.equal(none.available, false);
  assert.equal(none.recommendedIndex, null);
  assert.match(none.error, /No route analyses/);

  const analyses = [
    { index: 0, score: 78, durationSeconds: 900, durationMinutes: 15, potholes: { count: 2, highCount: 0 }, traffic: { available: false }, weather: { available: false }, incidents: { available: false } },
    { index: 1, score: 66, durationSeconds: 780, durationMinutes: 13, potholes: { count: 0, highCount: 0 }, traffic: { available: false }, weather: { available: false }, incidents: { available: false } },
  ];
  const intel = await getRouteIntelligence({ analyses });
  assert.equal(intel.available, true);
  assert.equal(typeof intel.recommendedIndex, "number");
  assert.ok(Array.isArray(intel.reasons));
  assert.ok(intel.reasons.length > 0);
});

tests.push(async () => {
  // Endpoint contract required by the phase spec.
  assert.equal(API_ENDPOINTS[DOMAINS.HAZARDS].list, "GET /hazards");
  assert.equal(API_ENDPOINTS[DOMAINS.HAZARDS].create, "POST /hazards");
  assert.equal(API_ENDPOINTS[DOMAINS.HAZARDS].update, "PATCH /hazards/:id");
  assert.equal(API_ENDPOINTS[DOMAINS.PREDICTIONS].roadHealth, "GET /road-health");
  assert.equal(API_ENDPOINTS[DOMAINS.PREDICTIONS].repairPriority, "GET /repair-priority");
  assert.equal(API_ENDPOINTS[DOMAINS.PREDICTIONS].routeIntelligence, "GET /route-intelligence");
  assert.throws(() => requireAdminSession(), AdminRequiredError);
});

const run = async () => {
  for (const fn of tests) await t("", fn);
  endAdminSession();
  console.log(`\n${passed} hazard service tests passed`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
