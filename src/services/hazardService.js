/**
 * Persistent road hazard data services (Phase 23).
 *
 * No server is deployed — see services/backend.js for the evaluation — so the
 * ACTIVE implementation reads and writes localStorage through the same
 * repository interface a REST backend will implement. When VITE_API_BASE_URL
 * is configured the very same calls switch to HTTP with no caller changes.
 *
 * Structured endpoints provided (mirroring API_ENDPOINTS):
 *   GET    /hazards           → getHazards()
 *   POST   /hazards           → postHazard()
 *   PATCH  /hazards/:id       → patchHazard()
 *   GET    /road-health       → getRoadHealth()
 *   GET    /repair-priority   → getRepairPriority()
 *   GET    /route-intelligence→ getRouteIntelligence()
 *
 * Administrative operations (verification, severity/status changes) require
 * an admin session token issued when the in-app admin PIN is accepted.
 *
 * HONEST LIMITATION: with the local implementation this guard is client-side
 * only — anyone with the browser can edit their own storage. Real enforcement
 * happens on the server side of the same contract (Authorization header), so
 * the HTTP path rejects admin writes without a token server-side as well as
 * here.
 */
import {
  API_ENDPOINTS,
  DOMAINS,
  createLocalRepository,
  createRepository,
} from "./backend";
import { roadHealthIndex, ROAD_HEALTH_LABEL } from "../utils/roadHealth";
import { rankRepairs, PRIORITY_LABEL } from "../utils/repairPriority";
import { recommendRoute, buildRecommendationReasons } from "../utils/recommendation";

/* ------------------------------------------------------------------ *
 * Admin session
 * ------------------------------------------------------------------ */

export const ADMIN_SESSION_KEY = "starsAdminSession";

/** Thrown when an administrative operation is attempted without a session. */
export class AdminRequiredError extends Error {
  constructor(message = "Administrative operation requires an admin session") {
    super(message);
    this.name = "AdminRequiredError";
  }
}

/** Fallback when sessionStorage is unavailable (private mode, Node). */
let memoryToken = null;

function sessionStore() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

/** Issue an admin session token (called when the admin PIN is accepted). */
export function startAdminSession({ now = Date.now() } = {}) {
  const token = `adm-${Number(now).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const s = sessionStore();
  if (s) {
    try {
      s.setItem(ADMIN_SESSION_KEY, token);
      memoryToken = token;
      return token;
    } catch {
      /* fall through to memory */
    }
  }
  memoryToken = token;
  return token;
}

/** End the admin session (sign-out / page policy). */
export function endAdminSession() {
  memoryToken = null;
  const s = sessionStore();
  if (s) {
    try {
      s.removeItem(ADMIN_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Current admin token or null. */
export function getAdminSessionToken() {
  const s = sessionStore();
  if (s) {
    try {
      const token = s.getItem(ADMIN_SESSION_KEY);
      if (token) return token;
    } catch {
      /* ignore */
    }
  }
  return memoryToken;
}

/** @returns {string} the session token @throws {AdminRequiredError} */
export function requireAdminSession() {
  const token = getAdminSessionToken();
  if (!token) throw new AdminRequiredError();
  return token;
}

/* ------------------------------------------------------------------ *
 * Repository helpers
 * ------------------------------------------------------------------ */

function repoFor(opts = {}) {
  if (opts.repository) return opts.repository;
  return createRepository({ ...opts, getAdminToken: getAdminSessionToken });
}

/**
 * Replace the whole hazard collection (bulk persistence path used by the app).
 * Local-only by design: the app's persistence is synchronous today, and a
 * server-side bulk write is added when a backend is actually configured.
 *
 * @param {Array} list
 * @param {Object|null} [storage] injectable storage (tests)
 * @returns {boolean} whether storage accepted the write
 */
export function replaceHazards(list, storage = null) {
  return createLocalRepository(storage).replace(
    DOMAINS.HAZARDS,
    Array.isArray(list) ? list : []
  );
}

/** Synchronous read of the stored hazard collection (empty list when absent). */
export function loadHazards(storage = null) {
  const list = createLocalRepository(storage).list(DOMAINS.HAZARDS);
  return list.filter((r) => r && typeof r === "object");
}

/* ------------------------------------------------------------------ *
 * Structured endpoints
 * ------------------------------------------------------------------ */

/** GET /hazards */
export async function getHazards(opts = {}) {
  const list = await repoFor(opts).list(DOMAINS.HAZARDS);
  return Array.isArray(list) ? list : [];
}

/** POST /hazards — public (crowdsourced reports are unauthenticated). */
export async function postHazard(record, opts = {}) {
  if (!record || typeof record !== "object") {
    throw new Error("postHazard: record is required");
  }
  return repoFor(opts).create(DOMAINS.HAZARDS, record);
}

/**
 * PATCH /hazards/:id
 * @param {Object} [opts]
 * @param {boolean} [opts.admin] administrative write → requires admin session
 */
export async function patchHazard(id, patch, opts = {}) {
  const admin = Boolean(opts.admin);
  const token = admin ? requireAdminSession() : null;
  const repo = opts.repository || createRepository({ ...opts, getAdminToken: () => token });
  const result = await repo.update(DOMAINS.HAZARDS, id, patch || {}, admin ? { admin: true } : {});
  if (result == null) throw new Error(`patchHazard: hazard ${id} not found`);
  return result;
}

/** PATCH /hazards/:id/verification — administrative only. */
export async function setHazardVerification(
  id,
  { status, severity = null, notes = null },
  opts = {}
) {
  if (!status) throw new Error("setHazardVerification: status is required");
  const patch = { status };
  if (severity != null) patch.severity = severity;
  if (notes != null) patch.adminNotes = notes;
  return patchHazard(id, patch, { ...opts, admin: true });
}

/** GET /road-health — report-based index over the stored hazard database. */
export async function getRoadHealth(opts = {}) {
  const reports = opts.reports || loadHazards(opts.storage);
  const result = roadHealthIndex({ reports });
  return {
    endpoint: API_ENDPOINTS[DOMAINS.PREDICTIONS].roadHealth,
    label: ROAD_HEALTH_LABEL,
    computedAt: Date.now(),
    ...result,
  };
}

/** GET /repair-priority — ranked active hazards from the stored database. */
export async function getRepairPriority(opts = {}) {
  const reports = opts.reports || loadHazards(opts.storage);
  const ranked = rankRepairs(reports, opts.ctx || {});
  return {
    endpoint: API_ENDPOINTS[DOMAINS.PREDICTIONS].repairPriority,
    label: PRIORITY_LABEL,
    computedAt: Date.now(),
    count: ranked.length,
    items: ranked,
  };
}

/**
 * GET /route-intelligence — recommendation for the analyses the caller
 * already computed (route analysis needs live Mapbox data, so the caller
 * passes it in; nothing is invented here).
 *
 * @param {Object} opts
 * @param {Array} [opts.analyses] per-route analyses from utils/routeAnalysis
 */
export async function getRouteIntelligence({ analyses = [], ...rest } = {}) {
  const list = Array.isArray(analyses) ? analyses : [];
  const result = recommendRoute(list);
  return {
    endpoint: API_ENDPOINTS[DOMAINS.PREDICTIONS].routeIntelligence,
    computedAt: Date.now(),
    available: Boolean(result),
    recommendedIndex: result ? result.recommendedIndex : null,
    recommendation: result,
    reasons: result ? buildRecommendationReasons(list, result) : [],
    error: list.length ? null : "No route analyses available",
  };
}
