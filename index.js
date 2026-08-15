/**
 * Host half of dsh-opencode-go-pool.
 *
 * One class-based Cordis plugin that also exposes the `opencodePool` Typert
 * Remote (strict-mode dispatch driven by `typert.host.js`):
 *
 *   1. Registers the `opencode-go-pool` settings namespace (schema + entry
 *      config as the base layer); the card writes keys through `putKeys`
 *      with the settings seam's revision fencing.
 *   2. Maintains the KeyPool state machine, persisted to
 *      `$DSH_HOME/opencode-go-pool.state.json`.
 *   3. Owns the provider route (default `opencode-go`, taking over the
 *      single-key route dsh-llm-pi-ai serves): an LlmAdapter whose stream()
 *      silently retries with the next pool key on quota/credential failures
 *      that arrive before any content, so the conversation never notices.
 *      While the route is owned elsewhere the plugin stays dormant and
 *      re-attempts registration on every `llm/adapters-updated` commit.
 *   4. Answers the card: per-key usage from the official OpenCode Go usage
 *      endpoint, plus switch/disable/clear actions.
 *
 * @module dsh-opencode-go-pool
 */

import z from '@deepseek-ai/schemastery'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import {
  assertUsableApiKey,
  INVALID_CREDENTIAL_CODE,
  LlmAdapter,
  LlmError,
  QUOTA_EXCEEDED_CODE,
  resolveRetryPolicy,
} from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go'
import { AUTH_CODE, KeyPool, assertKeyList } from './pool.js'
import { fetchUsage, UsageCache } from './usage.js'

export const name = 'opencode-go-pool'

const NS = settingsNamespace('opencode-go-pool')
const DISPLAY_NAME = 'OpenCode Zen Go（池）'
const DEFAULT_ROUTE = 'opencode-go'
const ALT_ROUTE = 'opencode-go-pool'
const DEFAULT_USAGE_BASE_URL = 'https://opencode.ai/zen/go/v1/usage'
const DEFAULT_USAGE_REFRESH_MS = 30000
const DEFAULT_TIMEOUT_MS = 15000
const USAGE_CACHE_TTL_MS = 15000
const REVIVE_THRESHOLD_PERCENT = 98
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000

/** The default bounded transient-retry code set, plus quota for pool rotation. */
const BASE_RETRYABLE_CODES = ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT']

const keyEntry = z.object({
  id: z.string(),
  label: z.string(),
  apiKeyEnv: z.string().role('credential-ref'),
})

export const Config = z.object({
  route: z.union([DEFAULT_ROUTE, ALT_ROUTE]).default(DEFAULT_ROUTE),
  keys: z.array(keyEntry).default([]),
  preemptAtPercent: z.number().min(0).max(100).default(100),
  usageBaseUrl: z.string().default(DEFAULT_USAGE_BASE_URL),
  usageRefreshMs: z.number().min(5000).max(300000).default(DEFAULT_USAGE_REFRESH_MS),
  timeoutMs: z.number().min(1000).max(120000).default(DEFAULT_TIMEOUT_MS),
})

/** Cross-field constraints the schema cannot express; refuses the write. */
function validateSection(value) {
  assertKeyList(value.keys ?? [])
}

/** Build the resolved pi-ai profile for the opencode-go catalog route. */
function buildProfile(route) {
  const provider = opencodeGoProvider()
  if (provider.id !== route) provider.id = route
  return {
    provider: route,
    displayName: DISPLAY_NAME,
    streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    retryPolicy: resolveRetryPolicy(undefined, 'opencode-go-pool.catalog.retryPolicy'),
    piProvider: provider,
    configuredMaxTokens: new Map(),
  }
}

/** A terminal error finish stating the whole pool is dry. */
function dryPoolFinish(message) {
  return {
    type: 'finish',
    reason: { kind: 'error', failure: { code: QUOTA_EXCEEDED_CODE, message } },
  }
}

function isContentChunk(chunk) {
  return chunk.type === 'block-start'
    || chunk.type === 'text-delta'
    || chunk.type === 'reasoning-delta'
    || chunk.type === 'tool-call-delta'
    || chunk.type === 'block-end'
}

/** Quota → rotate; credential problems → rotate (invalid mark); everything else keeps the key. */
function isRotationFailure(failure) {
  if (!failure) return false
  const code = failure.code
  return code === QUOTA_EXCEEDED_CODE || code === INVALID_CREDENTIAL_CODE || code === AUTH_CODE
}

function failureOf(error) {
  if (error && typeof error === 'object'
      && typeof error.code === 'string' && typeof error.message === 'string') {
    return { code: error.code, message: error.message }
  }
  return null
}

/**
 * The pool adapter. Metadata (catalog, retry policy shape, model resolution)
 * delegates to a catalog PiAiAdapter; stream() runs the failover loop.
 */
class OpenCodeGoPoolAdapter extends LlmAdapter {
  constructor(plugin) {
    super()
    this.plugin = plugin
  }

  providerInfo(provider) {
    return { id: provider, name: DISPLAY_NAME }
  }

  providerRetryPolicy(_provider) {
    const budget = Math.max(2, this.plugin.pool.keyCount())
    return resolveRetryPolicy({
      mode: 'normal',
      maxRetries: budget,
      retryableCodes: [...BASE_RETRYABLE_CODES, QUOTA_EXCEEDED_CODE],
    }, 'opencode-go-pool.retryPolicy')
  }

  listModels(provider) {
    return this.plugin.innerCatalog.listModels(provider)
  }

  resolveModel(provider, model, signal) {
    return this.plugin.innerCatalog.resolveModel(provider, model, signal)
  }

  async *stream(options) {
    const pool = this.plugin.pool
    const attempts = pool.usableCount() + 1
    for (let attempt = 0; attempt < attempts; attempt++) {
      const entry = pool.currentKey()
      if (!entry) {
        yield dryPoolFinish('opencode-go-pool: every key is exhausted, disabled, or invalid — add or revive a key in Settings → OpenCode Go 套餐池')
        return
      }
      const inner = this.plugin.makeAttemptAdapter(entry)
      let emitted = false
      let silentRetry = false
      let finish = null
      try {
        for await (const chunk of inner.stream(options)) {
          if (chunk.type === 'finish') {
            if (chunk.reason.kind === 'error' && isRotationFailure(chunk.reason.failure)) {
              pool.onFailure(entry.id, chunk.reason.failure)
              // Silent failover only before any content: retry with the next
              // key. `continue` here must restart the OUTER attempt loop, so
              // it breaks the inner for-await first.
              silentRetry = !emitted
            }
            finish = chunk
            break
          }
          if (isContentChunk(chunk)) emitted = true
          yield chunk
        }
      } catch (error) {
        const failure = failureOf(error)
        if (failure && isRotationFailure(failure) && !emitted) {
          pool.onFailure(entry.id, failure)
          silentRetry = true
        } else {
          throw error
        }
      }
      if (silentRetry) continue
      if (finish !== null) {
        yield finish
        return
      }
      // Degenerate inner adapter that ended without a terminal finish.
      return
    }
  }
}

/**
 * The plugin service. Extends TypertRemoteService so the Gateway can claim
 * and dispatch the `opencodePool` invocations declared in typert.host.js.
 */
export class OpenCodeGoPool extends TypertRemoteService {
  static inject = ['llm', 'credentials', 'settings']
  static Config = Config

  constructor(ctx, config) {
    super(ctx, 'opencodePool')
    this.ctx = ctx
    this.logger = ctx.logger ?? console

    this.scope = ctx.settings.register(NS, Config, {
      base: config ?? {},
      validate: validateSection,
    })
    this.current = () => this.scope.get()

    this.pool = new KeyPool({
      stateFile: dshHomePath('opencode-go-pool.state.json'),
      reviveThresholdPercent: REVIVE_THRESHOLD_PERCENT,
    })
    this.usageCache = new UsageCache({ ttlMs: USAGE_CACHE_TTL_MS })

    this.profileRoute = null
    this.profileMap = null
    this.innerCatalog = null
    this.poolAdapter = null
    this.registration = null
    this.servingRoute = null
    this.lastTakeoverError = null

    this.applyConfig()
    this.scope.watch(() => this.applyConfig())
    this.offAdaptersUpdated = ctx.on('llm/adapters-updated', () => {
      if (this.servingRoute === null) this.tryRegister()
    })
    this.tryRegister()
  }

  // ---- configuration & registration ---------------------------------------

  applyConfig() {
    const cfg = this.current()
    this.pool.setPreempt(cfg.preemptAtPercent)
    this.pool.syncKeys(cfg.keys)

    if (this.profileRoute !== cfg.route) {
      this.profileRoute = cfg.route
      this.profileMap = new Map([[cfg.route, buildProfile(cfg.route)]])
      this.innerCatalog = new PiAiAdapter({
        profiles: () => this.profileMap,
        resolveApiKey: async () => {
          throw new Error('opencode-go-pool: the catalog adapter never resolves keys')
        },
        resolveAttachments: () => this.ctx.get('attachments'),
      })
    }
    if (!this.poolAdapter) this.poolAdapter = new OpenCodeGoPoolAdapter(this)

    if (this.servingRoute === cfg.route) return
    this.tryRegister()
  }

  /**
   * Register (or atomically re-route) the pool adapter. A conflicting route
   * leaves the previous registration serving and records the refusal; the
   * `llm/adapters-updated` subscription retries after every topology commit,
   * so removing the opencode-go row under Settings → Models hands the route
   * to this plugin automatically.
   */
  tryRegister() {
    const route = this.current().route
    if (this.servingRoute === route) return
    try {
      if (this.registration === null) {
        this.registration = this.ctx.llm.registerAdapter([route], this.poolAdapter)
      } else {
        this.registration.replace([route])
      }
      this.servingRoute = route
      this.lastTakeoverError = null
      this.logger?.info?.(`[opencode-go-pool] serving provider route "${route}"`)
    } catch (error) {
      this.lastTakeoverError = String((error && error.message) || error)
      this.logger?.warn?.(`[opencode-go-pool] route "${route}" unavailable: ${this.lastTakeoverError}; waiting for the owning plugin to release it`)
    }
  }

  takeoverState() {
    if (this.servingRoute === DEFAULT_ROUTE) return 'serving'
    if (this.servingRoute === ALT_ROUTE) return 'own-route'
    return 'waiting'
  }

  // ---- credentials & adapters ----------------------------------------------

  /** Per-attempt adapter bound to one key: no cross-attempt key races. */
  makeAttemptAdapter(entry) {
    return new PiAiAdapter({
      profiles: () => this.profileMap,
      resolveApiKey: () => this.resolveKeyValue(entry),
      resolveAttachments: () => this.ctx.get('attachments'),
    })
  }

  /** Resolve one key's credential reference through the credentials seam. */
  async resolveKeyValue(entry) {
    const credentials = this.ctx.get('credentials')
    const ref = credentialRef(entry.apiKeyEnv)
    let hit
    if (credentials) {
      try {
        hit = (await credentials.resolve(ref))?.value
      } catch {
        hit = undefined
      }
    }
    if (!hit || hit.length === 0) {
      throw new LlmError(
        `opencode-go-pool: no credential for key "${entry.id}" (${entry.apiKeyEnv}) — store it through the credentials service (the web Models page writes it) or export it`,
        'MISSING_CREDENTIAL',
      )
    }
    return assertUsableApiKey(hit, 'opencode-go-pool', ref)
  }

  // ---- Typert Remote surface (the card) -------------------------------------

  async status() {
    const cfg = this.current()
    const fetchedAt = new Date().toISOString()
    const entries = this.pool.entries()
    const usageResults = await Promise.all(entries.map(async entry => {
      try {
        const key = await this.resolveKeyValue(entry)
        const usage = await this.usageCache.get(entry.id, () => fetchUsage({
          baseUrl: cfg.usageBaseUrl,
          apiKey: key,
          timeoutMs: cfg.timeoutMs,
        }))
        this.pool.onUsage(entry.id, usage)
        return { id: entry.id, usage, usageError: null, fetchedAt }
      } catch (error) {
        const code = error && error.code ? error.code : 'network'
        return {
          id: entry.id,
          usage: null,
          usageError: code === 'MISSING_CREDENTIAL' ? 'no-api-key' : code,
          fetchedAt: null,
        }
      }
    }))
    return {
      takeover: this.takeoverState(),
      route: this.servingRoute ?? cfg.route,
      usageRefreshMs: cfg.usageRefreshMs,
      preemptAtPercent: cfg.preemptAtPercent,
      activeId: this.pool.activeId,
      lastSwitch: this.pool.lastSwitch,
      takeoverHint: this.servingRoute ? null : this.lastTakeoverError,
      keys: entries.map(entry => {
        const st = this.pool.stateOf(entry.id)
        const result = usageResults.find(item => item.id === entry.id)
        return {
          id: entry.id,
          label: entry.label,
          apiKeyEnv: entry.apiKeyEnv,
          state: st.state,
          active: entry.id === this.pool.activeId,
          usage: (result && result.usage) ?? null,
          usageError: (result && result.usageError) ?? null,
          fetchedAt: (result && result.fetchedAt) ?? null,
          lastFailure: st.lastFailure ?? null,
        }
      }),
    }
  }

  async setActive(id) {
    this.pool.setActive(id)
    return true
  }

  async setDisabled(id, on) {
    this.pool.setDisabled(id, on)
    return true
  }

  async clearInvalid(id) {
    this.pool.clearInvalid(id)
    return true
  }

  async putKeys(keys) {
    assertKeyList(keys)
    await this.scope.mutate({ keys })
    return true
  }

  async takeOverState() {
    return this.takeoverState()
  }
}

export default OpenCodeGoPool
