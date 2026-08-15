/**
 * Usage gateway helpers for the official OpenCode Go usage endpoint:
 *
 *   GET <baseUrl>            (default https://opencode.ai/zen/go/v1/usage)
 *   Authorization: Bearer <apiKey>
 *
 * Response (undocumented, community-verified):
 *   { "usage": { "rolling": {status, percent, resetsAt},
 *                "weekly":  {status, percent, resetsAt},
 *                "monthly": {status, percent, resetsAt} } }
 *
 * Parsing is defensive: the endpoint is not part of OpenCode's public docs,
 * so any shape drift degrades to a coded error the card renders, never a crash.
 *
 * @module dsh-opencode-go-pool/usage
 */

/** Coded failure for one usage query; `code` is a stable machine key. */
export class UsageError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function pickWindow(value) {
  if (!value || typeof value !== 'object') return null
  const percent = typeof value.percent === 'number' ? value.percent : Number(value.percent)
  return {
    status: typeof value.status === 'string' ? value.status : null,
    percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null,
    resetsAt: typeof value.resetsAt === 'string' ? value.resetsAt : null,
  }
}

/**
 * Query the usage endpoint once for one key.
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {string} options.apiKey
 * @param {number} [options.timeoutMs]
 * @param {Function} [options.fetchImpl] - injectable fetch for tests.
 * @returns {Promise<{rolling: object|null, weekly: object|null, monthly: object|null}>}
 * @throws {UsageError} with codes: network | unauthorized | http-<status> | bad-json
 */
export async function fetchUsage({ baseUrl, apiKey, timeoutMs = 15000, fetchImpl }) {
  const impl = fetchImpl ?? globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await impl(baseUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    })
  } catch {
    throw new UsageError('network', `usage request failed: ${baseUrl}`)
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 401) {
    throw new UsageError('unauthorized', 'usage endpoint rejected the key (401)')
  }
  if (!res.ok) {
    throw new UsageError(`http-${res.status}`, `usage endpoint answered HTTP ${res.status}`)
  }
  let body
  try {
    body = await res.json()
  } catch {
    throw new UsageError('bad-json', 'usage endpoint answered with non-JSON')
  }
  const usage = body && typeof body === 'object' && body.usage ? body.usage : body
  return {
    rolling: pickWindow(usage && usage.rolling),
    weekly: pickWindow(usage && usage.weekly),
    monthly: pickWindow(usage && usage.monthly),
  }
}

/**
 * Small TTL cache with in-flight dedupe: the client card polls every 30s,
 * several keys query in parallel, and concurrent pollers share one request
 * per key instead of stampeding the endpoint.
 */
export class UsageCache {
  /**
   * @param {object} [options]
   * @param {number} [options.ttlMs] - freshness window for successful values (default 15000).
   * @param {() => number} [options.now] - clock injection for tests.
   */
  constructor({ ttlMs = 15000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs
    this.now = now
    this.entries = new Map()
    this.inflight = new Map()
  }

  /**
   * @param {string} key - cache key (pool key id).
   * @param {() => Promise<any>} fetcher - runs only on a miss; failures are never cached.
   * @returns {Promise<any>} fresh or cached value.
   */
  async get(key, fetcher) {
    const hit = this.entries.get(key)
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value
    const inflight = this.inflight.get(key)
    if (inflight) return inflight
    const promise = Promise.resolve()
      .then(fetcher)
      .then(value => {
        this.entries.set(key, { value, at: this.now() })
        return value
      })
      .finally(() => { this.inflight.delete(key) })
    this.inflight.set(key, promise)
    return promise
  }

  invalidate(key) {
    this.entries.delete(key)
  }
}
