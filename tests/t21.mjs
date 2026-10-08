/**
 * Phase 21 — Historical trip safety analytics tests.
 * Run from a tmp harness dir containing ./utils.
 */
import assert from "node:assert/strict";
import {
  createTrip,
  endTrip,
  tripSummary,
  loadTripHistory,
  saveTripHistory,
  upsertTrip,
  MAX_TRIPS,
} from "./src/features/community/tripHistory.js";

let passed = 0;
function t(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const A = [77.6, 12.97]; // origin
const B = [77.64, 12.98]; // destination
const C = [77.61, 12.95];

function trip(over = {}) {
  return createTrip({
    originCoord: A,
    originLabel: "Home",
    destCoord: B,
    destLabel: "Office",
    routeIndex: 0,
    distanceMeters: 5200,
    durationMinutes: 18,
    safetyScore: 80,
    classification: "Safe",
    incidentCount: 1,
    potholeCount: 2,
    startedAt: 1_700_000_000_000,
    ...over,
  });
}

t("no trips → no fabricated statistics", () => {
  const s = tripSummary([]);
  assert.equal(s.tripCount, 0);
  assert.equal(s.avgSafety, null);
  assert.equal(s.safestRoute, null);
  assert.equal(s.mostFrequentRoute, null);
  assert.equal(s.hazardsEncountered, 0);
  assert.equal(s.withWeather, 0);
  assert.equal(tripSummary(null).tripCount, 0);
});

t("createTrip records weather only when provided", () => {
  assert.equal(trip().weather, null);
  assert.equal(trip({ weather: "light rain" }).weather, "light rain");
  assert.equal(trip({ weather: "" }).weather, null);
});

t("weather survives the save/load roundtrip", () => {
  const storage = {
    data: {},
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = v; },
  };
  const list = upsertTrip([], trip({ weather: "scattered clouds", startedAt: 1_700_000_100_000 }));
  assert.ok(saveTripHistory(list, storage));
  const back = loadTripHistory(storage);
  assert.equal(back.length, 1);
  assert.equal(back[0].weather, "scattered clouds");
  assert.equal(back[0].classification, "Safe");
});

t("tripSummary aggregates recorded trips", () => {
  const trips = [
    endTrip(trip({ safetyScore: 80, incidentCount: 1, potholeCount: 2, startedAt: 1_700_000_300_000 })),
    endTrip(trip({ safetyScore: 60, incidentCount: 3, potholeCount: 0, startedAt: 1_700_000_200_000 })),
    trip({ safetyScore: 95, startedAt: 1_700_000_400_000 }), // still active
  ];
  const s = tripSummary(trips);
  assert.equal(s.tripCount, 3);
  assert.equal(s.activeCount, 1);
  assert.equal(s.arrivedCount, 0);
  assert.equal(s.avgSafety, 70); // (80 + 60) / 2 — active trip excluded
  assert.equal(s.hazardsEncountered, 6); // only ended trips counted
  assert.equal(s.totalKm, 10.4); // 5.2 km × 2
  assert.equal(s.totalMinutes, 36);
});

t("safest route comes from ended, scored trips only", () => {
  const trips = [
    trip({ safetyScore: 99, startedAt: 1_700_000_900_000 }), // active high score → ignored
    endTrip(trip({ safetyScore: 62, startedAt: 1_700_000_100_000 })),
    endTrip(trip({ safetyScore: 84, startedAt: 1_700_000_200_000 })),
    endTrip(
      trip({
        originCoord: C,
        originLabel: "Other",
        destLabel: "Office",
        safetyScore: null,
        startedAt: 1_700_000_300_000,
      })
    ),
  ];
  const s = tripSummary(trips);
  assert.equal(s.safestRoute.safetyScore, 84);
  assert.equal(s.safestRoute.label, "Home → Office");
  assert.equal(s.safestRoute.classification, "Safe");
});

t("safest-route ties resolve to the newest trip; no score → null", () => {
  const trips = [
    endTrip(trip({ safetyScore: 75, startedAt: 1_700_000_100_000 })),
    endTrip(trip({ safetyScore: 75, startedAt: 1_700_000_500_000 })),
  ];
  assert.equal(tripSummary(trips).safestRoute.startedAt, 1_700_000_500_000);
  const onlyUnscored = [endTrip(trip({ safetyScore: null }))];
  assert.equal(tripSummary(onlyUnscored).safestRoute, null);
  assert.equal(tripSummary(onlyUnscored).avgSafety, null);
});

t("most frequent route counts origin→destination pairs", () => {
  const trips = [
    trip({ startedAt: 3 }),
    trip({ startedAt: 2 }),
    endTrip(trip({ originCoord: C, originLabel: "Gym", destCoord: B, destLabel: "Office", startedAt: 1 })),
    // unlabeled trip with the Home→Office endpoints merges via coordinates only
    endTrip(trip({ originLabel: "", destLabel: "", startedAt: 4 })),
  ];
  const s = tripSummary(trips);
  // Labeled Home→Office appears twice; the unlabeled trip keeps its own
  // coordinate-based key, and Gym→Office appears once.
  assert.equal(s.mostFrequentRoute.count, 2);
  assert.equal(s.mostFrequentRoute.label, "Home → Office");
});

t("unlabeled trips never merge with labeled ones", () => {
  const trips = [trip({ originLabel: "", destLabel: "", startedAt: 2 }), trip({ startedAt: 1 })];
  const s = tripSummary(trips);
  assert.equal(s.mostFrequentRoute.count, 1);
});

t("history caps at MAX_TRIPS and drops corrupt records", () => {
  const storage = {
    data: {},
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = v; },
  };
  let list = [];
  for (let i = 0; i < MAX_TRIPS + 10; i += 1) {
    list = upsertTrip(list, trip({ startedAt: 1_700_000_000_000 + i * 1000 }));
  }
  saveTripHistory(list, storage);
  storage.setItem("tripHistory", JSON.stringify([{ junk: true }, ...JSON.parse(storage.getItem("tripHistory"))]));
  assert.equal(loadTripHistory(storage).length, MAX_TRIPS);
  storage.setItem("tripHistory", "not-json");
  assert.deepEqual(loadTripHistory(storage), []);
});

console.log(`\n${passed} trip analytics tests passed`);
