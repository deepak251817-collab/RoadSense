/**
 * Phase 22 — Backend architecture preparation tests.
 * Run from a tmp harness dir containing ./services (and ./utils).
 */
import assert from "node:assert/strict";
import {
  API_ENDPOINTS,
  DOMAINS,
  LOCAL_COLLECTION_KEYS,
  REPOSITORY_KINDS,
  apiBaseUrl,
  createHttpRepository,
  createLocalRepository,
  createRepository,
  isBackendConfigured,
} from "./src/services/backend.js";

let passed = 0;

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
};

const tests = [];

tests.push(() => {
  const required = [
    [DOMAINS.HAZARDS, "list", "GET /hazards"],
    [DOMAINS.HAZARDS, "create", "POST /hazards"],
    [DOMAINS.HAZARDS, "update", "PATCH /hazards/:id"],
    [DOMAINS.REPORTS, "create", "POST /reports"],
    [DOMAINS.VERIFICATION, "update", "PATCH /hazards/:id/verification"],
    [DOMAINS.PREDICTIONS, "roadHealth", "GET /road-health"],
    [DOMAINS.PREDICTIONS, "repairPriority", "GET /repair-priority"],
    [DOMAINS.PREDICTIONS, "routeIntelligence", "GET /route-intelligence"],
  ];
  for (const [domain, op, expected] of required) {
    assert.equal(API_ENDPOINTS[domain][op], expected, `${domain}.${op}`);
  }
});

tests.push(() => {
  // All seven prepared interfaces exist and every domain has a storage key.
  for (const domain of Object.values(DOMAINS)) {
    assert.ok(API_ENDPOINTS[domain], `endpoints for ${domain}`);
    assert.ok(LOCAL_COLLECTION_KEYS[domain], `local key for ${domain}`);
  }
  assert.deepEqual(
    Object.values(DOMAINS),
    ["users", "trips", "hazards", "road-segments", "reports", "verification", "predictions"]
  );
});

tests.push(() => {
  // No backend configured in this environment (Node has no Vite env).
  assert.equal(apiBaseUrl(), null);
  assert.equal(isBackendConfigured(), false);
  assert.equal(createRepository({}).kind, REPOSITORY_KINDS.LOCAL);
});

tests.push(() => {
  const storage = memoryStorage();
  const repo = createLocalRepository(storage);
  assert.equal(repo.kind, REPOSITORY_KINDS.LOCAL);
  const created = repo.create(DOMAINS.HAZARDS, { severity: "high", lat: 12.9 });
  assert.ok(created.id);
  assert.ok(created.createdAt);
  assert.equal(repo.list(DOMAINS.HAZARDS).length, 1);
  assert.equal(repo.get(DOMAINS.HAZARDS, created.id).severity, "high");
  const updated = repo.update(DOMAINS.HAZARDS, created.id, { severity: "low" });
  assert.equal(updated.severity, "low");
  assert.equal(updated.updatedAt != null, true);
  assert.equal(updated.id, created.id);
  assert.equal(repo.get(DOMAINS.HAZARDS, "missing"), null);
  assert.equal(repo.update(DOMAINS.HAZARDS, "missing", {}), null);
  assert.equal(repo.remove(DOMAINS.HAZARDS, created.id), true);
  assert.equal(repo.remove(DOMAINS.HAZARDS, created.id), false);
  assert.equal(repo.list(DOMAINS.HAZARDS).length, 0);
  assert.throws(() => repo.list("nope"), /Unknown collection/);
});

tests.push(() => {
  // Reused keys mean existing app data is what the repository reads.
  const storage = memoryStorage({ userPotholeReports: JSON.stringify([{ id: "r1" }]) });
  const repo = createLocalRepository(storage);
  assert.equal(repo.list(DOMAINS.HAZARDS)[0].id, "r1");
  assert.equal(repo.list(DOMAINS.REPORTS)[0].id, "r1");
  assert.equal(repo.domainUrl(DOMAINS.HAZARDS), "local://userPotholeReports");
});

tests.push(() => {
  // Broken storage degrades to in-memory instead of throwing.
  const broken = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("quota"); },
  };
  const repo = createLocalRepository(broken);
  const created = repo.create(DOMAINS.TRIPS, { id: "t1" });
  assert.equal(created.id, "t1");
  assert.equal(repo.list(DOMAINS.TRIPS).length, 1);
});

tests.push(() => {
  assert.throws(() => createHttpRepository({ fetchImpl: async () => ({}) }), /no base URL/);
  // No explicit fetch impl → falls back to the global fetch (present in Node 18+).
  const repo = createHttpRepository({ baseUrl: "https://api.test" });
  assert.equal(repo.kind, REPOSITORY_KINDS.HTTP);
});

tests.push(async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => [{ id: "h1" }] };
  };
  const repo = createRepository({ baseUrl: "https://api.test/", fetchImpl });
  assert.equal(repo.kind, REPOSITORY_KINDS.HTTP);
  const list = await repo.list(DOMAINS.HAZARDS);
  assert.deepEqual(list, [{ id: "h1" }]);
  assert.equal(calls[0].url, "https://api.test/hazards");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(repo.domainUrl(DOMAINS.HAZARDS), "https://api.test/hazards");

  await repo.create(DOMAINS.HAZARDS, { severity: "high" });
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), { severity: "high" });
  assert.equal(calls[1].init.headers["Content-Type"], "application/json");
});

tests.push(async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const repo = createHttpRepository({
    baseUrl: "https://api.test",
    fetchImpl,
    getAdminToken: () => "secret-token",
  });

  // Administrative write sends the token…
  await repo.update(DOMAINS.HAZARDS, "h1", { status: "verified" }, { admin: true });
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-token");
  assert.equal(calls[0].url, "https://api.test/hazards/h1");

  // …and is refused when no admin session exists.
  const noToken = createHttpRepository({ baseUrl: "https://api.test", fetchImpl });
  await assert.rejects(
    () => noToken.update(DOMAINS.HAZARDS, "h1", { status: "verified" }, { admin: true }),
    /admin token required/
  );
  // Reads never require a token.
  await noToken.get(DOMAINS.HAZARDS, "h1");
  assert.equal(calls[1].init.headers.Authorization, undefined);
});

tests.push(async () => {
  const repo = createHttpRepository({
    baseUrl: "https://api.test",
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  await assert.rejects(() => repo.list(DOMAINS.HAZARDS), /HTTP 503/);

  const empty = createHttpRepository({
    baseUrl: "https://api.test",
    fetchImpl: async () => ({ ok: true, status: 204 }),
  });
  assert.equal(await empty.remove(DOMAINS.HAZARDS, "h1"), null);
});

const run = async () => {
  for (const fn of tests) {
    await fn();
    passed += 1;
    console.log(`ok ${passed}`);
  }
  console.log(`\n${passed} backend preparation tests passed`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
