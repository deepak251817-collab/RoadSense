/**
 * Phase 24 — Multi-user crowdsourcing tests.
 * Run from a tmp harness dir containing ./utils.
 */
import assert from "node:assert/strict";
import {
  AUTOMATIC_VERIFICATION,
  DUPLICATE_CLUSTER_MIN_REPORTS,
  DUPLICATE_THRESHOLD_METERS,
  MAX_CONFIRMATIONS,
  addConfirmation,
  confirmationCount,
  findDuplicateCandidate,
  findNearbyReport,
  highestSeverity,
  isEligibleReport,
  likelyDuplicate,
  mergeDuplicateReport,
  summarizeCluster,
} from "./utils/crowdsourcing.js";

let passed = 0;
async function t(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const A = [77.6, 12.97];
const A_NEAR = [77.6, 12.9701]; // ≈ 11 m north
const A_FAR = [77.6, 12.9705]; // ≈ 55 m north

const rep = (over = {}) => ({
  id: over.id ?? 1,
  coord: A,
  type: "pothole",
  severity: "moderate",
  status: "reported",
  description: "test",
  createdAt: 1_700_000_000_000,
  ...over,
});

const tests = [];

tests.push(async () => {
  assert.equal(DUPLICATE_THRESHOLD_METERS, 20);
  assert.equal(DUPLICATE_CLUSTER_MIN_REPORTS, 5);
  assert.equal(AUTOMATIC_VERIFICATION, false); // hard rule
});

tests.push(async () => {
  assert.equal(isEligibleReport(rep()), true);
  assert.equal(isEligibleReport(rep({ status: "verified" })), true);
  assert.equal(isEligibleReport(rep({ status: "fixed" })), false);
  assert.equal(isEligibleReport(rep({ status: "rejected" })), false);
  assert.equal(isEligibleReport(rep({ hiddenGlobally: true })), false);
  assert.equal(isEligibleReport(rep({ hiddenForUser: true })), false);
  assert.equal(isEligibleReport(null), false);
  assert.equal(isEligibleReport({ id: 2 }), false);
});

tests.push(async () => {
  const reports = [rep({ id: 1, coord: A }), rep({ id: 2, coord: A_FAR, type: "waterlogging" })];
  const near = findNearbyReport(reports, A_NEAR);
  assert.equal(near.report.id, 1);
  assert.ok(near.distanceMeters <= 20);

  assert.equal(findNearbyReport([reports[0]], A_FAR, { thresholdMeters: 20 }), null);
  assert.equal(findNearbyReport(reports, A_NEAR, { excludeId: 1 }), null);
  assert.equal(findNearbyReport(reports, A_NEAR, { sameTypeOnly: true, type: "waterlogging" }), null);
  assert.equal(findNearbyReport(reports, A_NEAR, { sameTypeOnly: true, type: "pothole" }).report.id, 1);
  assert.equal(findNearbyReport(null, A_NEAR), null);
  assert.equal(findNearbyReport(reports, null), null);
});

tests.push(async () => {
  const reports = [
    rep({ id: 1, coord: A, type: "pothole" }),
    rep({ id: 2, coord: A, type: "waterlogging" }),
    rep({ id: 3, coord: A, type: "pothole", status: "fixed" }),
  ];
  const dup = findDuplicateCandidate(reports, { id: 99, coord: A_NEAR, type: "pothole" });
  assert.equal(dup.report.id, 1); // fixed report never matches
  assert.equal(
    findDuplicateCandidate(reports, { id: 99, coord: A_NEAR, type: "waterlogging" }).report.id,
    2
  );
  assert.equal(
    findDuplicateCandidate(reports, { id: 1, coord: A, type: "pothole" }),
    null,
    "a report never duplicates itself"
  );
  assert.equal(findDuplicateCandidate(reports, { coord: A_FAR, type: "pothole" }), null);
});

tests.push(async () => {
  const r0 = rep();
  assert.equal(confirmationCount(r0), 0);
  const r1 = addConfirmation(r0, { at: 111, source: "user", note: "still there" });
  assert.equal(confirmationCount(r1), 1);
  assert.equal(r1.lastConfirmedAt, 111);
  assert.equal(r1.status, "reported", "confirmation never changes status");
  assert.deepEqual(r1.confirmations[0].note, "still there");

  let big = r0;
  for (let i = 0; i < MAX_CONFIRMATIONS + 5; i += 1) big = addConfirmation(big, { at: i });
  assert.equal(confirmationCount(big), MAX_CONFIRMATIONS); // capped
});

tests.push(async () => {
  const existing = rep({ id: 1, severity: "low", status: "reported" });
  const incoming = rep({ id: 2, severity: "high", status: "reported" });
  const merged = mergeDuplicateReport(existing, incoming, { at: 42 });
  assert.equal(merged.severity, "high");
  assert.equal(merged.relatedReportCount, 2);
  assert.equal(confirmationCount(merged), 1);
  assert.deepEqual(merged.evidenceIds, [1, 2]);
  assert.equal(merged.status, "reported", "duplicate merge never verifies");
  assert.equal(highestSeverity("low", "high"), "high");
  assert.equal(highestSeverity("high", "low"), "high");
  assert.equal(highestSeverity(null, "moderate"), "moderate");
});

tests.push(async () => {
  // Ten duplicate reports with confirmations still stay unverified.
  let hazard = rep({ id: 1, severity: "low", status: "reported" });
  for (let i = 2; i <= 10; i += 1) {
    hazard = mergeDuplicateReport(hazard, rep({ id: i, severity: "moderate" }), { at: i });
  }
  assert.equal(hazard.status, "reported");
  assert.equal(hazard.relatedReportCount, 10);
  const summary = summarizeCluster([hazard]);
  assert.equal(summary.reportCount, 10);
  assert.equal(summary.likelyDuplicate, true);
  assert.equal(summary.severity, "moderate");
  assert.equal(likelyDuplicate(DUPLICATE_CLUSTER_MIN_REPORTS), true);
  assert.equal(likelyDuplicate(DUPLICATE_CLUSTER_MIN_REPORTS - 1), false);
});

tests.push(async () => {
  const empty = summarizeCluster([]);
  assert.deepEqual(empty, {
    reportCount: 0,
    confirmations: 0,
    severity: null,
    firstReportedAt: null,
    lastReportedAt: null,
    likelyDuplicate: false,
  });

  const a = rep({ id: 1, severity: "high", createdAt: undefined, captureAt: 1000 });
  const b = rep({ id: 2, severity: "low", createdAt: 5000, status: "verified" });
  const s = summarizeCluster([a, addConfirmation(b, { at: 1 })]);
  assert.equal(s.reportCount, 2);
  assert.equal(s.confirmations, 1);
  assert.equal(s.severity, "high");
  assert.equal(s.firstReportedAt, 1000);
  assert.equal(s.lastReportedAt, 5000);
  assert.equal(s.likelyDuplicate, false);
});

const run = async () => {
  for (const fn of tests) await t("", fn);
  console.log(`\n${passed} crowdsourcing tests passed`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
