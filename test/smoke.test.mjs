import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { OpenCodeGoPool } from '../index.js'

function makeMockLlms() {
  return {
    registered: [],
    adapter: null,
    registerAdapter(routes, adapter) {
      this.registered.push([...routes])
      this.adapter = adapter
      return {
        replace: next => { this.registered.push([...next]) },
      }
    },
  }
}

function makeMockSettings(get) {
  const scope = {
    get,
    watch: () => () => {},
    mutate: async () => {},
    replace: async () => {},
  }
  return {
    scope,
    register: () => scope,
  }
}

test('plugin registers the opencode-go route and serves the pi-ai catalog', async () => {
  const root = new Context()
  const llms = makeMockLlms()
  root.provide('llm', llms)
  root.provide('settings', makeMockSettings(() => ({
    route: 'opencode-go',
    keys: [],
    preemptAtPercent: 100,
    usageBaseUrl: 'https://opencode.ai/zen/go/v1/usage',
    usageRefreshMs: 30000,
    timeoutMs: 15000,
  })))
  root.provide('credentials', { resolve: async () => undefined })

  await root.plugin(OpenCodeGoPool, {})
  assert.ok(llms.adapter, 'pool adapter registered')
  assert.deepEqual(llms.registered[0], ['opencode-go'])

  const models = await llms.adapter.listModels('opencode-go')
  assert.ok(Array.isArray(models) && models.length > 0, 'catalog lists models')
  const ids = models.map(m => m.id)
  assert.ok(ids.includes('deepseek-v4-flash'), 'catalog keeps opencode-go models')

  // Dry pool: no keys configured → the stream yields one terminal quota error
  // instead of making any provider request.
  const chunks = []
  for await (const chunk of llms.adapter.stream({
    provider: 'opencode-go',
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk)
  }
  assert.equal(chunks.at(-1).type, 'finish')
  assert.equal(chunks.at(-1).reason.kind, 'error')
  assert.equal(chunks.at(-1).reason.failure.code, 'QUOTA')
  await root.fiber.dispose()
})

test('a key without a resolvable credential fails the stream loud (MISSING_CREDENTIAL)', async () => {
  const root = new Context()
  const llms = makeMockLlms()
  root.provide('llm', llms)
  root.provide('settings', makeMockSettings(() => ({
    route: 'opencode-go',
    keys: [{ id: 'acc-a', label: '主号', apiKeyEnv: 'OPENCODE_GO_KEY_A' }],
    preemptAtPercent: 100,
    usageBaseUrl: 'https://opencode.ai/zen/go/v1/usage',
    usageRefreshMs: 30000,
    timeoutMs: 15000,
  })))
  root.provide('credentials', { resolve: async () => undefined })

  await root.plugin(OpenCodeGoPool, {})
  const stream = llms.adapter.stream({
    provider: 'opencode-go',
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  await assert.rejects(async () => {
    for await (const _chunk of stream) { /* drain */ }
  }, err => err.code === 'MISSING_CREDENTIAL')
  await root.fiber.dispose()
})

test('status() reports the pool without network when keys are empty', async () => {
  const root = new Context()
  const llms = makeMockLlms()
  root.provide('llm', llms)
  root.provide('settings', makeMockSettings(() => ({
    route: 'opencode-go',
    keys: [],
    preemptAtPercent: 100,
    usageBaseUrl: 'https://opencode.ai/zen/go/v1/usage',
    usageRefreshMs: 30000,
    timeoutMs: 15000,
  })))
  root.provide('credentials', { resolve: async () => undefined })

  await root.plugin(OpenCodeGoPool, {})
  const plugin = root.get("opencodePool")
  const status = await plugin.status()
  assert.equal(status.takeover, 'serving')
  assert.equal(status.route, 'opencode-go')
  assert.deepEqual(status.keys, [])
  await root.fiber.dispose()
})
