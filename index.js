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
 *   5. Model selection: the card picks which catalog models the route
 *      exposes (listModels filters; resolveModel/stream gate the rest).
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
  // Consecutive non-quota failures (rate limit / server / timeout) after
  // which the pool rotates away from a key; 0 disables the rule.
  switchAfterConsecutiveFailures: z.number().min(0).max(20).default(0),
  // Which models the pool route exposes. 'all' follows the official catalog
  // (new models appear automatically); 'custom' exposes exactly `models`.
  modelMode: z.union(['all', 'custom']).default('all'),
  models: z.array(z.string()).default([]),
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
    // Newer llm-pi-ai builds read modelCapabilities in listModels; a catalog
    // route with no configured overrides declares none, so an empty map is
    // the exact contract (capabilityInfo() returns no claims).
    modelCapabilities: new Map(),
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

  async listModels(provider) {
    const list = await this.plugin.innerCatalog.listModels(provider)
    const selection = this.plugin.modelSelection()
    if (selection === null) return list
    return list.filter(entry => selection.has(entry.id))
  }

  async resolveModel(provider, model, signal) {
    const selection = this.plugin.modelSelection()
    if (selection !== null && !selection.has(model)) {
      throw new LlmError(
        `model "${model}" is not enabled in the OpenCode Go pool model selection (Settings → OpenCode Go 套餐池 → 模型选择)`,
        'UNKNOWN_MODEL',
      )
    }
    return this.plugin.innerCatalog.resolveModel(provider, model, signal)
  }

  async *stream(options) {
    const selection = this.plugin.modelSelection()
    if (selection !== null && options.model && !selection.has(options.model)) {
      throw new LlmError(
        `model "${options.model}" is not enabled in the OpenCode Go pool model selection (Settings → OpenCode Go 套餐池 → 模型选择)`,
        'UNKNOWN_MODEL',
      )
    }
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
            if (chunk.reason.kind === 'error') {
              // quota/auth codes rotate the pool; other codes count the
              // transient-failure streak and rotate once the configured
              // consecutive-failure threshold trips. Either rotation can
              // trigger a silent retry while no content was emitted.
              const rotation = pool.onFailure(entry.id, chunk.reason.failure)
              if (rotation !== null) silentRetry = !emitted
            } else if (chunk.reason.kind !== 'aborted') {
              pool.onSuccess(entry.id)
            }
            finish = chunk
            break
          }
          if (isContentChunk(chunk)) emitted = true
          yield chunk
        }
      } catch (error) {
        const failure = failureOf(error)
        if (failure) {
          const rotation = pool.onFailure(entry.id, failure)
          if (rotation !== null && !emitted) {
            silentRetry = true
          } else {
            throw error
          }
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
    this.lastModelSelection = null

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
    this.pool.setConsecutiveThreshold(cfg.switchAfterConsecutiveFailures)
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

    const selection = this.modelSelectionKey(cfg)
    if (this.servingRoute === cfg.route) {
      // The model selection changed without a route change: re-announce the
      // route so model pickers refresh their catalog from the filtered
      // listModels(). Settings docs that predate the field read as 'all'.
      if (this.lastModelSelection !== null && this.lastModelSelection !== selection) {
        this.announceAdapterChange()
      }
      this.lastModelSelection = selection
      return
    }
    this.lastModelSelection = selection
    this.tryRegister()
  }

  /** A stable key for the enabled-model selection (null = all models). */
  modelSelectionKey(cfg) {
    return JSON.stringify([cfg.modelMode ?? 'all', [...(cfg.models ?? [])].sort()])
  }

  /**
   * The enabled-model filter: null = the whole catalog, otherwise the Set of
   * explicitly selected ids. Tolerates undefined fields from pre-feature
   * settings documents.
   */
  modelSelection() {
    const cfg = this.current()
    if (cfg.modelMode !== 'custom' || !Array.isArray(cfg.models) || cfg.models.length === 0) return null
    return new Set(cfg.models)
  }

  /** Re-announce the current route so adapters-updated listeners refresh catalogs. */
  announceAdapterChange() {
    if (this.registration === null || this.servingRoute === null) return
    try {
      this.registration.replace([this.servingRoute])
    } catch (error) {
      this.logger?.warn?.(`[opencode-go-pool] catalog re-announce failed: ${String((error && error.message) || error)}`)
    }
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

  /** The card-facing model selector data: catalog entries plus enabled flags. */
  async listAvailableModels(cfg) {
    const route = this.profileRoute ?? cfg.route
    let catalog = []
    try {
      if (this.innerCatalog) catalog = await this.innerCatalog.listModels(route)
    } catch {
      catalog = []
    }
    const selection = cfg.modelMode === 'custom' && Array.isArray(cfg.models) ? new Set(cfg.models) : null
    return catalog.map(entry => ({
      id: entry.id,
      name: entry.name ?? entry.id,
      enabled: selection === null || selection.has(entry.id),
    }))
  }

  async status() {
    const cfg = this.current()
    const fetchedAt = new Date().toISOString()
    const entries = this.pool.entries()
    const availableModels = await this.listAvailableModels(cfg)
    const usageResults = await Promise.all(entries.map(async entry => {
      try {
        const key = await this.resolveKeyValue(entry)
        const usage = await this.usageCache.get(entry.id, () => fetchUsage({
          baseUrl: cfg.usageBaseUrl,
          apiKey: key,
          timeoutMs: cfg.timeoutMs,
        }))
        this.pool.onUsage(entry.id, usage)
        return { id: entry.id, usage, usageError: null, fetchedAt, credentialSet: true }
      } catch (error) {
        const code = error && error.code ? error.code : 'network'
        return {
          id: entry.id,
          usage: null,
          usageError: code === 'MISSING_CREDENTIAL' ? 'no-api-key' : code,
          fetchedAt: null,
          credentialSet: code !== 'MISSING_CREDENTIAL',
        }
      }
    }))
    return {
      takeover: this.takeoverState(),
      route: this.servingRoute ?? cfg.route,
      usageRefreshMs: cfg.usageRefreshMs,
      preemptAtPercent: cfg.preemptAtPercent,
      switchAfterConsecutiveFailures: cfg.switchAfterConsecutiveFailures,
      modelMode: cfg.modelMode ?? 'all',
      availableModels,
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
          credentialSet: (result && result.credentialSet) ?? false,
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
    await this.scope.update({ keys })
    return true
  }

  /**
   * Store one key's literal secret through the credentials seam under its
   * configured reference name. The secret never enters settings, logs, or
   * any response — the same carrier and trust domain the Models page uses
   * when it writes credentials.
   */
  async putKeySecret(id, secret) {
    const entry = this.pool.entries().find(item => item.id === id)
    if (!entry) throw new Error(`unknown key "${id}"`)
    if (typeof secret !== 'string' || secret.trim().length === 0) {
      throw new Error(`key "${id}" needs a non-empty secret`)
    }
    const credentials = this.ctx.get('credentials')
    if (!credentials || typeof credentials.set !== 'function') {
      throw new Error('no credentials service is mounted — set the key through the credentials page instead')
    }
    const ref = credentialRef(entry.apiKeyEnv)
    const usable = assertUsableApiKey(secret.trim(), 'opencode-go-pool', ref)
    await credentials.set(ref, usable)
    // A freshly supplied secret may repair an invalid-marked key.
    this.pool.clearInvalid(id)
    this.usageCache.invalidate(id)
    return true
  }

  /** Update the card-visible pool settings (thresholds only, never keys). */
  async putConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('putConfig needs an object')
    const patch = {}
    if (config.preemptAtPercent !== undefined) {
      const value = Number(config.preemptAtPercent)
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('preemptAtPercent must be 0..100')
      patch.preemptAtPercent = value
    }
    if (config.switchAfterConsecutiveFailures !== undefined) {
      const value = Number(config.switchAfterConsecutiveFailures)
      if (!Number.isFinite(value) || value < 0 || value > 20) throw new Error('switchAfterConsecutiveFailures must be 0..20')
      patch.switchAfterConsecutiveFailures = value
    }
    if (config.modelMode !== undefined) {
      if (config.modelMode !== 'all' && config.modelMode !== 'custom') throw new Error('modelMode must be "all" or "custom"')
      patch.modelMode = config.modelMode
    }
    if (config.models !== undefined) {
      if (!Array.isArray(config.models) || config.models.some(id => typeof id !== 'string' || id.trim().length === 0)) {
        throw new Error('models must be an array of non-empty model ids')
      }
      patch.models = [...new Set(config.models.map(id => id.trim()))]
    }
    if (Object.keys(patch).length === 0) throw new Error('putConfig received no known fields')
    const effective = { ...this.current(), ...patch }
    if (effective.modelMode === 'custom' && (!Array.isArray(effective.models) || effective.models.length === 0)) {
      throw new Error('custom model selection needs at least one model — pick models or use modelMode "all"')
    }
    await this.scope.update(patch)
    return true
  }

  async takeOverState() {
    return this.takeoverState()
  }
}

export default OpenCodeGoPool
