// Local harness for the DSH 0.2 port: boots the plugin against the real
// harness packages (copied next to this repo) with stubbed llm/credentials
// services, then exercises the catalog, one real streamed call, and usage.
import { Context } from '@deepseek-ai/cordis'
import OpenCodeGoPool from '../index.js'
import { fetchUsage } from '../usage.js'

const KEY = process.env.OPENCODE_KEY
if (!KEY) throw new Error('set OPENCODE_KEY')

const app = new Context()
const registrations = []

app.provide('llm', {
  registerAdapter(providers, adapter) {
    registrations.push({ providers, adapter })
    const handle = () => {}
    handle.replace = next => { registrations.at(-1).providers = next }
    return handle
  },
})

app.provide('credentials', {
  async resolve(ref) {
    return String(ref).includes('OPENCODE_GO_KEY_A') ? { value: KEY } : undefined
  },
  async set() {},
  async readRecord() { return undefined },
  async listRecords() { return [] },
})

const plugin = new OpenCodeGoPool(app, {
  route: 'opencode-go',
  keys: [{ id: 'a', label: 'A', apiKeyEnv: 'OPENCODE_GO_KEY_A' }],
  modelMode: 'all',
  usageBaseUrl: 'https://opencode.ai/zen/go/v1/usage',
  modelsBaseUrl: 'https://opencode.ai/zen/go/v1/models',
  usageRefreshMs: 30000,
  timeoutMs: 15000,
  preemptAtPercent: 100,
  switchAfterConsecutiveFailures: 0,
  models: [],
})

console.log('route registrations:', registrations.map(r => r.providers))
const route = plugin.servingRoute
console.log('serving route:', route, 'takeover:', plugin.takeoverState())

try {
  const resolved = await plugin.resolveKeyValue(plugin.pool.entries()[0])
  console.log('key resolves:', resolved.slice(0, 12) + '...')
} catch (error) {
  console.log('key resolve failed:', error && error.code, error && error.message)
}

try {
  const usage = await fetchUsage({ baseUrl: 'https://opencode.ai/zen/go/v1/usage', apiKey: KEY })
  console.log('usage direct:', JSON.stringify(usage))
} catch (error) {
  console.log('usage direct failed:', error && error.code, error && error.message)
}

const models = await plugin.poolAdapter.listModels(route)
console.log('catalog size:', models.length)
console.log('first models:', models.slice(0, 8).map(m => m.id))

const target = models.find(m => /glm|deepseek-v4-pro|kimi/i.test(m.id)) ?? models[0]
console.log('streaming with:', target.id)
const chunks = []
for await (const chunk of plugin.poolAdapter.stream({
  provider: route,
  model: target.id,
  sessionId: 'ses_local_smoke',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: pool-ok' }] }],
  maxTokens: 64,
})) {
  chunks.push(chunk)
  if (chunk.type === 'text-delta') process.stdout.write(chunk.text)
}
console.log('\nchunk types:', chunks.map(c => c.type).join(','))
const finish = chunks.find(c => c.type === 'finish')
console.log('finish:', JSON.stringify(finish))

const status = await plugin.status()
console.log('status keys:', status.keys.map(k => ({ id: k.id, state: k.state, active: k.active, usageError: k.usageError, weekly: k.usage && k.usage.weekly })))
console.log('takeover:', status.takeover, 'models:', status.availableModels.length)
process.exit(0)
