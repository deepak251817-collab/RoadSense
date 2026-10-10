/**
 * HTTP client with timeout, retry, and optional TTL caching.
 *
 * All external calls in the app go through here so that a flaky network
 * degrades gracefully (bounded retries with exponential backoff) instead of
 * hanging forever (per-attempt timeout via AbortController). Retries only
 * happen when it is safe: network failures, timeouts, 5xx, and 429.
 * 4xx responses are returned/thrown immediately — retrying them is pointless.
 *
 * No dependencies; works in browsers and in Node tests (AbortController
 * exists in both).
 */

/** Error carrying HTTP status + URL for caller-friendly messages. */
export class HttpError extends Error {
  constructor(message, { status = 0, url = "" } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

const DEFAULTS = {
  timeoutMs: 10000,
  retries: 2,
  backoffMs: 750,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when a failed attempt is worth retrying. */
function isRetryable(error) {
  if (error instanceof HttpError) return error.status >= 500 || error.status === 429;
  // AbortError / TypeError / network errors are retryable
  return true;
}

/**
 * Fetch a URL with per-attempt timeout and bounded retries.
 *
 * @param {string} url
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs] per-attempt timeout
 * @param {number} [opts.retries] extra attempts after the first
 * @param {number} [opts.backoffMs] base delay; doubles per attempt
 * @param {Object} [opts.headers]
 * @param {Object} [opts.init] extra fetch init (method, body, ...)
 * @param {AbortSignal} [opts.signal] caller cancellation
 * @returns {Promise<Response>} last response (callers keep their res.ok checks)
 */
export async function fetchWithTimeout(url, opts = {}) {
  const {
    timeoutMs = DEFAULTS.timeoutMs,
    retries = DEFAULTS.retries,
    backoffMs = DEFAULTS.backoffMs,
    headers,
    init = {},
    signal: outerSignal,
  } = opts;

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (outerSignal?.aborted) throw new Error("Aborted");
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (outerSignal) outerSignal.addEventListener("abort", onOuterAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const retryableStatus = res.status >= 500 || res.status === 429;
      if (retryableStatus && attempt < retries) {
        lastError = new HttpError(`HTTP ${res.status} for ${url}`, { status: res.status, url });
        // drain body so the connection can be reused
        try { await res.text(); } catch { /* ignore */ }
      } else {
        return res;
      }
    } catch (err) {
      lastError =
        err?.name === "AbortError"
          ? new HttpError(`Timeout after ${timeoutMs}ms for ${url}`, { status: 0, url })
          : err;
      if (!isRetryable(lastError) || attempt >= retries) throw lastError;
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
    }
    await sleep(backoffMs * 2 ** attempt);
  }
  throw lastError || new Error(`Request failed for ${url}`);
}

/**
 * Fetch and parse JSON. Throws HttpError on non-ok responses after retries.
 *
 * @returns {Promise<any>} parsed body
 */
export async function fetchJson(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new HttpError(`HTTP ${res.status} for ${url}: ${detail}`, { status: res.status, url });
  }
  return res.json();
}

// ---- Tiny in-memory TTL cache (per-key expiry) ----
const cache = new Map(); // key → { data, expiresAt }

/**
 * fetchJson with a TTL cache. Cache hits skip the network entirely.
 *
 * @param {string} url
 * @param {Object} [opts] fetchJson options + `ttlMs` (0 = no caching) + `cacheKey`
 * @returns {Promise<{data:any, cached:boolean}>}
 */
export async function fetchJsonCached(url, opts = {}) {
  const { ttlMs = 0, cacheKey = url, ...rest } = opts;
  if (ttlMs > 0) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return { data: hit.data, cached: true };
  }
  const data = await fetchJson(url, rest);
  if (ttlMs > 0) cache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
  return { data, cached: false };
}
