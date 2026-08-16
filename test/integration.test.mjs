import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// Real-service integration tests: the plugin runs against the ACTUAL
// LlmRuntime registry and the ACTUAL settings seam (in-memory provider
// fixture, mirroring packages/settings/settings/tests/memory.ts) inside a
// cordis context. These exercise the paths the live host will take:
// registerAdapter into the real registry, providerRetryPolicy capture,
// LlmRuntime.stream dispatch through the pool adapter, putKeys writes
// through the real settings seam, and the takeover handshake via the real
// adapters-updated event. They skip when the harness peers are absent.

function isolateHome(t) {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-opencode-go-pool-'))
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })
}

async function loadHarness(t) {
  isolateHome(t)
  let Context, LlmRuntime, SettingsProvider, OpenCodeGoPool, LlmAdapter, createUserMessage
  try {
    ;({ Context } = await import('@deepseek-ai/cordis'))
    ;({ default: LlmRuntime, LlmAdapter } = await import('@deepseek-ai/dsh-llm'))
    ;({ SettingsProvider } = await import('@deepseek-ai/dsh-settings'))
    ;({ OpenCodeGoPool } = await import('../index.js'))
    ;({ createUserMessage } = await import('@deepseek-ai/dsh-llm/message'))
  } catch {
    t.skip('harness peer deps not installed — link the DSH node_modules to run integration tests')
    return null
  }
  /** In-memory settings provider: the smallest real SettingsProvider subclass. */
  const MemorySettings = class extends SettingsProvider {
    constructor(ctx, options = {}) {
      super(ctx)
      this.doc = structuredClone(options?.doc ?? {})
      this.persisted = []
    }
    get writable() {
      return true
    }
    load() {
      return Promise.resolve(structuredClone(this.doc))
    }
    async persist(ns, section) {
      this.persisted.push({ ns, section: structuredClone(section) })
      this.doc[ns] = structuredClone(section)
    }
  }
  return { Context, LlmRuntime, MemorySettings, OpenCodeGoPool, LlmAdapter, createUserMessage }
}

const TWO_KEYS = [
  { id: 'acc-a', label: '主号', apiKeyEnv: 'OPENCODE_GO_KEY_A' },
  { id: 'acc-b', label: '备用2', apiKeyEnv: 'OPENCODE_GO_KEY_B' },
]

const quotaFinish = {
  type: 'finish',
  reason: { kind: 'error', failure: { code: 'QUOTA', message: 'quota exhausted' } },
}
const successChunks = [
  { type: 'text-delta', index: 0, text: 'hello' },
  { type: 'finish', reason: { kind: 'stop' } },
]

class FakeInnerAdapter {
  constructor(script) {
    this.script = script
    this.calls = 0
  }
  async *stream(_options) {
    const step = this.script[Math.min(this.calls++, this.script.length - 1)]
    for (const chunk of step) yield chunk
  }
}

/** Build a dummy adapter class off the dynamically imported LlmAdapter base. */
function makeDummyOwner(LlmAdapter) {
  return class extends LlmAdapter {
    async *stream(_options) {
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

async function bootReal(Context, LlmRuntime, MemorySettings, OpenCodeGoPool, entryConfig) {
  const root = new Context()
  await root.plugin(LlmRuntime)
  const memorySettings = new MemorySettings(root)
  root.provide('credentials', { resolve: async () => undefined })
  await root.plugin(OpenCodeGoPool, entryConfig ?? { keys: TWO_KEYS })
  return { root, memorySettings, llm: root.get('llm'), plugin: root.get('opencodePool') }
}

test('registers into the real llm registry with the pool retry policy and the pi-ai catalog', async (t) => {
  const harness = await loadHarness(t)
  if (!harness) return
  const { Context, LlmRuntime, MemorySettings, OpenCodeGoPool } = harness
  const { root, llm } = await bootReal(Context, LlmRuntime, MemorySettings, OpenCodeGoPool)

  const providers = llm.listProviders()
  const ours = providers.find(p => p.id === 'opencode-go')
  assert.ok(ours, 'opencode-go route registered')
  assert.equal(ours.name, 'OpenCode Zen Go（池）')

  const policy = llm.providerRetryPolicy('opencode-go')
  assert.equal(policy.mode, 'normal')
  assert.ok(policy.retryableCodes.includes('QUOTA'), 'quota joins the retryable codes')

  const models = await llm.listModels('opencode-go')
  assert.ok(models.map(m => m.id).includes('deepseek-v4-flash'))
  await root.fiber.dispose()
})

test('LlmRuntime.stream dispatches through the pool adapter and silent failover', async (t) => {
  const harness = await loadHarness(t)
  if (!harness) return
  const { Context, LlmRuntime, MemorySettings, OpenCodeGoPool, createUserMessage } = harness
  const { root, llm, plugin } = await bootReal(Context, LlmRuntime, MemorySettings, OpenCodeGoPool)

  const fake = new FakeInnerAdapter([[quotaFinish], successChunks])
  plugin.makeAttemptAdapter = () => fake

  const message = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] })
  const chunks = []
  for await (const chunk of llm.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', messages: [message] })) {
    chunks.push(chunk)
  }

  const finishes = chunks.filter(c => c.type === 'finish')
  assert.equal(finishes.length, 1)
  assert.equal(finishes[0].reason.kind, 'stop')
  assert.ok(chunks.some(c => c.type === 'text-delta' && c.text === 'hello'))
  assert.equal(fake.calls, 2)
  assert.equal(plugin.pool.stateOf('acc-a').state, 'exhausted')
  assert.equal(plugin.pool.activeId, 'acc-b')
  await root.fiber.dispose()
})

test('putKeys writes through the real settings seam with validation and persistence', async (t) => {
  const harness = await loadHarness(t)
  if (!harness) return
  const { Context, LlmRuntime, MemorySettings, OpenCodeGoPool } = harness
  const { root, memorySettings, plugin } = await bootReal(Context, LlmRuntime, MemorySettings, OpenCodeGoPool, { keys: [] })

  await plugin.putKeys([{ id: 'acc-a', label: '主号', apiKeyEnv: 'OPENCODE_GO_KEY_A' }])
  assert.equal(plugin.pool.keyCount(), 1)
  assert.equal(plugin.current().keys.length, 1)
  assert.ok(memorySettings.persisted.some(entry => entry.ns === 'opencode-go-pool'), 'section persisted')

  // Type-level violation: a non-string apiKeyEnv is refused (schemastery
  // rejects the write; unknown EXTRA fields are stripped, not rejected).
  await assert.rejects(
    () => plugin.putKeys([{ id: 'acc-a', label: '主号', apiKeyEnv: 12345 }]),
  )
  // Cross-field validation: duplicate env refs refused before any write.
  await assert.rejects(
    () => plugin.putKeys([
      { id: 'acc-a', label: '主号', apiKeyEnv: 'OPENCODE_GO_KEY_A' },
      { id: 'acc-b', label: '备用', apiKeyEnv: 'OPENCODE_GO_KEY_A' },
    ]),
    /duplicate apiKeyEnv/,
  )
  assert.equal(plugin.pool.keyCount(), 1, 'pool unchanged after refused writes')
  await root.fiber.dispose()
})

test('takeover against the real registry: dormant while owned, auto-registers when released', async (t) => {
  const harness = await loadHarness(t)
  if (!harness) return
  const { Context, LlmRuntime, MemorySettings, OpenCodeGoPool, LlmAdapter } = harness

  const root = new Context()
  await root.plugin(LlmRuntime)
  const memorySettings = new MemorySettings(root)
  root.provide('credentials', { resolve: async () => undefined })

  // Another plugin family owns opencode-go first (pi-ai's posture).
  const owner = new (makeDummyOwner(LlmAdapter))()
  const ownerRegistration = root.get('llm').registerAdapter(['opencode-go'], owner)

  await root.plugin(OpenCodeGoPool, { keys: TWO_KEYS })
  const plugin = root.get('opencodePool')
  assert.equal(plugin.takeoverState(), 'waiting')

  // The owner releases the route (user deletes the pi-ai row) → the real
  // registry emits adapters-updated → our plugin takes over.
  ownerRegistration()
  assert.equal(plugin.takeoverState(), 'serving')
  const ours = root.get('llm').listProviders().find(p => p.id === 'opencode-go')
  assert.equal(ours.name, 'OpenCode Zen Go（池）')
  await root.fiber.dispose()
})

test('a different route config registers its own route alongside the owner', async (t) => {
  const harness = await loadHarness(t)
  if (!harness) return
  const { Context, LlmRuntime, MemorySettings, OpenCodeGoPool, LlmAdapter } = harness

  const root = new Context()
  await root.plugin(LlmRuntime)
  const memorySettings = new MemorySettings(root)
  root.provide('credentials', { resolve: async () => undefined })

  root.get('llm').registerAdapter(['opencode-go'], new (makeDummyOwner(LlmAdapter))())
  await root.plugin(OpenCodeGoPool, { route: 'opencode-go-pool', keys: TWO_KEYS })
  const plugin = root.get('opencodePool')
  assert.equal(plugin.takeoverState(), 'own-route')
  const providers = root.get('llm').listProviders()
  assert.ok(providers.some(p => p.id === 'opencode-go'))
  assert.ok(providers.some(p => p.id === 'opencode-go-pool'), 'own route coexists')
  await root.fiber.dispose()
})

test('putKeySecret stores the literal through the credentials seam, never into settings', async (t) => {
  const harness = await loadHarness(t)
  if (!harness) return
  const { Context, LlmRuntime, MemorySettings, OpenCodeGoPool } = harness

  const root = new Context()
  await root.plugin(LlmRuntime)
  const memorySettings = new MemorySettings(root)
  const written = []
  root.provide('credentials', {
    resolve: async () => undefined,
    set: async (ref, value) => { written.push({ ref, value }) },
  })
  await root.plugin(OpenCodeGoPool, { keys: TWO_KEYS })
  const plugin = root.get('opencodePool')

  await plugin.putKeySecret('acc-a', 'sk-opencode-test-aaaa')
  assert.equal(written.length, 1)
  assert.equal(written[0].value, 'sk-opencode-test-aaaa')
  assert.equal(written[0].ref, 'OPENCODE_GO_KEY_A')
  // The secret never lands in the settings document.
  assert.ok(!JSON.stringify(memorySettings.doc).includes('sk-opencode-test-aaaa'))

  await assert.rejects(() => plugin.putKeySecret('nope', 'x'), /unknown key/)
  await assert.rejects(() => plugin.putKeySecret('acc-a', '   '), /non-empty secret/)
  await root.fiber.dispose()
})
