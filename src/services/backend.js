/**
 * Backend architecture preparation — service layer.
 *
 * EVALUATION (Phase 22): STARS is a single-user client application today and
 * localStorage is NOT yet a constraint: the dataset is small (capped trip and
 * report history), there is no server-side state and no cross-device sharing
 * requirement. Therefore NO backend and NO database are introduced here.
 * Migrating now would add cost, failure modes and maintenance without a
 * feature that needs it.
 *
 * What this module does instead: separates client state from a future
 * API-backed service layer by defining
 *
 *   1. the API contract every domain will expose (API_ENDPOINTS),
 *   2. a repository interface (list/get/create/update/remove) with two
 *      interchangeable implementations:
 *        - LocalRepository  → the current localStorage behavior (active),
 *        - HttpRepository   → a real REST backend, used only when
 *                             VITE_API_BASE_URL is configured.
 *
 * Existing features keep their current storage behavior; the service layer is
 * an interface preparation, not a migration. No credentials are stored here —
 * the base URL comes from an environment variable (VITE_API_BASE_URL) and is
 * read defensively so Node unit tests and non-Vite environments still work.
 */

/** Domains the future backend must cover (from the V3 architecture plan). */
export const DOMAINS = Object.freeze({
  USERS: "users",
  TRIPS: "trips",
  HAZARDS: "hazards",
  ROAD_SEGMENTS: "road-segments",
  REPORTS: "reports",
  VERIFICATION: "verification",
  PREDICTIONS: "predictions",
});

/**
 * REST contract for the future API. Values are "METHOD /path" descriptors —
 * documentation that the HTTP repository and the backend implement alike.
 */
export const API_ENDPOINTS = Object.freeze({
  [DOMAINS.USERS]: Object.freeze({
    list: "GET /users",
    get: "GET /users/:id",
    create: "POST /users",
  }),
  [DOMAINS.TRIPS]: Object.freeze({
    list: "GET /trips",
    create: "POST /trips",
  }),
  [DOMAINS.HAZARDS]: Object.freeze({
    list: "GET /hazards",
    get: "GET /hazards/:id",
    create: "POST /hazards",
    update: "PATCH /hazards/:id",
  }),
  [DOMAINS.ROAD_SEGMENTS]: Object.freeze({
    list: "GET /road-segments",
    create: "POST /road-segments",
  }),
  [DOMAINS.REPORTS]: Object.freeze({
    list: "GET /reports",
    create: "POST /reports",
  }),
  [DOMAINS.VERIFICATION]: Object.freeze({
    update: "PATCH /hazards/:id/verification",
  }),
  [DOMAINS.PREDICTIONS]: Object.freeze({
    roadHealth: "GET /road-health",
    repairPriority: "GET /repair-priority",
    routeIntelligence: "GET /route-intelligence",
  }),
});

/**
 * Which localStorage key backs each domain in the local implementation.
 * Keys already used by the app are reused as-is so no data is copied or
 * duplicated; domains the app does not persist yet get their own key.
 */
export const LOCAL_COLLECTION_KEYS = Object.freeze({
  [DOMAINS.USERS]: "starsUsers",
  [DOMAINS.TRIPS]: "tripHistory",
  [DOMAINS.HAZARDS]: "userPotholeReports",
  [DOMAINS.ROAD_SEGMENTS]: "roadChangeSnapshots",
  [DOMAINS.REPORTS]: "userPotholeReports",
  [DOMAINS.VERIFICATION]: "adminMessages",
  [DOMAINS.PREDICTIONS]: "starsPredictions",
});

export const REPOSITORY_KINDS = Object.freeze({ LOCAL: "local", HTTP: "http" });

/**
 * Read VITE_API_BASE_URL defensively:
 * - in Vite the literal is replaced at build time,
 * - in Node/browsers without Vite `import.meta.env` is undefined and the
 *   access throws, which we treat as "no backend configured".
 * @returns {string|null}
 */
export function apiBaseUrl() {
  try {
    const raw = import.meta.env.VITE_API_BASE_URL;
    const value = typeof raw === "string" ? raw.trim() : "";
    return value ? value.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

/** True only when a real API base URL has been configured. */
export function isBackendConfigured() {
  return apiBaseUrl() != null;
}

/** Resolve a domain to its localStorage key (throws on unknown domains). */
function keyFor(collection) {
  const key = LOCAL_COLLECTION_KEYS[collection];
  if (!key) throw new Error(`Unknown collection: ${collection}`);
  return key;
}

const nowIso = () => new Date().toISOString();

/**
 * localStorage-backed repository — the ACTIVE implementation.
 * Never throws for missing/broken storage: it degrades to in-memory reads.
 *
 * @param {Object|null} [storage] injectable storage (defaults to window.localStorage)
 * @param {Object} [opts]
 * @param {string} [opts.kind] repository kind reported to callers
 * @returns {{kind:string, list:Function, get:Function, create:Function, update:Function, remove:Function, domainUrl:Function}}
 */
export function createLocalRepository(storage = null, { kind = REPOSITORY_KINDS.LOCAL } = {}) {
  const mem = new Map(); // fallback when storage is unavailable
  const store = () => {
    if (storage) return storage;
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null;
    }
  };

  const read = (collection) => {
    const key = keyFor(collection);
    const s = store();
    if (!s) return mem.get(key) || [];
    try {
      const raw = s.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return mem.get(key) || [];
    }
  };

  const write = (collection, list) => {
    const key = keyFor(collection);
    const s = store();
    if (!s) {
      mem.set(key, list);
      return false;
    }
    try {
      s.setItem(key, JSON.stringify(list));
      return true;
    } catch {
      mem.set(key, list);
      return false;
    }
  };

  return {
    kind,
    domainUrl: (collection) => `local://${keyFor(collection)}`,
    list: (collection) => read(collection),
    get: (collection, id) => read(collection).find((r) => r && r.id === id) ?? null,
    create(collection, record) {
      const list = read(collection);
      const entry = {
        createdAt: nowIso(),
        ...(record && typeof record === "object" ? record : {}),
        id: record?.id || `local-${Date.now()}-${list.length}`,
      };
      write(collection, [entry, ...list]);
      return entry;
    },
    update(collection, id, patch) {
      const list = read(collection);
      const idx = list.findIndex((r) => r && r.id === id);
      if (idx < 0) return null;
      const entry = {
        ...list[idx],
        ...(patch && typeof patch === "object" ? patch : {}),
        id,
        updatedAt: nowIso(),
      };
      list[idx] = entry;
      write(collection, list);
      return entry;
    },
    remove(collection, id) {
      const list = read(collection);
      const next = list.filter((r) => !r || r.id !== id);
      if (next.length === list.length) return false;
      write(collection, next);
      return true;
    },
  };
}

/**
 * REST-backed repository — inactive until VITE_API_BASE_URL is set.
 * All methods reject with an Error on transport/HTTP failure so callers can
 * degrade gracefully (they never return fabricated data).
 *
 * @param {Object} opts
 * @param {string} [opts.baseUrl] overrides the env-derived base URL
 * @param {Function} [opts.fetchImpl] injectable fetch (tests)
 * @param {Function} [opts.getAdminToken] returns an admin token for write ops
 * @returns {{kind:string, list:Function, get:Function, create:Function, update:Function, remove:Function, domainUrl:Function}}
 */
export function createHttpRepository({
  baseUrl,
  fetchImpl,
  getAdminToken,
} = {}) {
  const base = (baseUrl || apiBaseUrl() || "").replace(/\/+$/, "");
  if (!base) throw new Error("createHttpRepository: no base URL configured");
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  if (!doFetch) throw new Error("createHttpRepository: no fetch implementation available");

  const request = async (method, path, body, { admin = false } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (admin) {
      const token = typeof getAdminToken === "function" ? getAdminToken() : null;
      if (!token) throw new Error("admin token required for this operation");
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await doFetch(`${base}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} failed: HTTP ${res.status}`);
    if (res.status === 204) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  const collPath = (collection) => {
    if (!API_ENDPOINTS[collection]) throw new Error(`Unknown collection: ${collection}`);
    return `/${collection}`;
  };

  return {
    kind: REPOSITORY_KINDS.HTTP,
    domainUrl: (collection) => `${base}${collPath(collection)}`,
    list: (collection) => request("GET", collPath(collection)),
    get: (collection, id) => request("GET", `${collPath(collection)}/${encodeURIComponent(id)}`),
    create: (collection, record) => request("POST", collPath(collection), record),
    update: (collection, id, patch, opts) =>
      request("PATCH", `${collPath(collection)}/${encodeURIComponent(id)}`, patch, opts),
    remove: (collection, id, opts) =>
      request("DELETE", `${collPath(collection)}/${encodeURIComponent(id)}`, undefined, opts),
  };
}

/**
 * Pick the repository implementation for the current environment.
 * Local by default; HTTP only when VITE_API_BASE_URL is configured (or an
 * explicit baseUrl is passed).
 *
 * @param {Object} [opts] forwarded to the chosen factory
 * @returns {Object} repository
 */
export function createRepository(opts = {}) {
  const base = opts.baseUrl || apiBaseUrl();
  if (base) return createHttpRepository({ ...opts, baseUrl: base });
  return createLocalRepository(opts.storage, opts);
}
