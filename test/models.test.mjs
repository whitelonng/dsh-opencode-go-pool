import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  dynamicModelDescriptor,
  fetchModels,
  loadDynamicModels,
  saveDynamicModels,
  titleCaseId,
  ModelsError,
} from '../models.js'

function fakeResponse(status, body, ok) {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    async json() {
      if (typeof body === 'string') throw new SyntaxError('not json')
      return body
    },
  }
}

test('fetchModels parses the OpenAI-compatible { data: [{ id }] } shape', async () => {
  const fetchImpl = async () => fakeResponse(200, {
    object: 'list',
    data: [
      { id: 'deepseek-v4-pro', object: 'model', created: 1, owned_by: 'opencode' },
      { id: 'glm-5.3', object: 'model', created: 1, owned_by: 'opencode' },
    ],
  })
  const models = await fetchModels({ baseUrl: 'u', fetchImpl })
  assert.deepEqual(models, [
    { id: 'deepseek-v4-pro', name: 'Deepseek V4 Pro' },
    { id: 'glm-5.3', name: 'Glm 5.3' },
  ])
})

test('fetchModels tolerates array bodies, string entries, and explicit names', async () => {
  const fetchImpl = async () => fakeResponse(200, [
    'bare-id',
    { id: 'named-id', name: 'Named Model' },
  ])
  const models = await fetchModels({ baseUrl: 'u', fetchImpl })
  assert.deepEqual(models, [
    { id: 'bare-id', name: 'Bare Id' },
    { id: 'named-id', name: 'Named Model' },
  ])
})

test('fetchModels sends the bearer key only when one is provided', async () => {
  let seen
  const fetchImpl = async (url, options) => {
    seen = { url, options }
    return fakeResponse(200, { data: [] })
  }
  await fetchModels({ baseUrl: 'u', apiKey: 'secret', fetchImpl })
  assert.equal(seen.options.headers.Authorization, 'Bearer secret')
  await fetchModels({ baseUrl: 'u', fetchImpl })
  assert.ok(!('Authorization' in seen.options.headers), 'no auth header when no key')
})

test('fetchModels classifies errors with stable codes', async () => {
  await assert.rejects(
    () => fetchModels({ baseUrl: 'u', fetchImpl: async () => fakeResponse(401, {}, false) }),
    err => err instanceof ModelsError && err.code === 'unauthorized',
  )
  await assert.rejects(
    () => fetchModels({ baseUrl: 'u', fetchImpl: async () => fakeResponse(503, 'busy', false) }),
    err => err instanceof ModelsError && err.code === 'http-503',
  )
  await assert.rejects(
    () => fetchModels({ baseUrl: 'u', fetchImpl: async () => fakeResponse(200, 'not json') }),
    err => err instanceof ModelsError && err.code === 'bad-json',
  )
  await assert.rejects(
    () => fetchModels({ baseUrl: 'u', fetchImpl: async () => { throw new TypeError('boom') } }),
    err => err instanceof ModelsError && err.code === 'network',
  )
})

test('dynamicModelDescriptor synthesizes a routable openai-completions entry', () => {
  const descriptor = dynamicModelDescriptor('glm-5.3', 'GLM-5.3', 'opencode-go')
  assert.equal(descriptor.id, 'glm-5.3')
  assert.equal(descriptor.provider, 'opencode-go')
  assert.equal(descriptor.api, 'openai-completions')
  assert.equal(descriptor.baseUrl, 'https://opencode.ai/zen/go/v1')
  assert.deepEqual(descriptor.input, ['text'])
  // Reasoning mirrors deepseek-v4-pro so the thinking-strength control works.
  assert.equal(descriptor.reasoning, true)
  assert.deepEqual(descriptor.thinkingLevelMap, { minimal: null, low: null, medium: null, high: 'high', max: 'max' })
  assert.equal(descriptor.compat.thinkingFormat, 'deepseek')
  assert.equal(descriptor.compat.maxTokensField, 'max_tokens')
})

test('titleCaseId guesses a display name from kebab-case ids', () => {
  assert.equal(titleCaseId('deepseek-v4-pro'), 'Deepseek V4 Pro')
  assert.equal(titleCaseId('glm-5.3'), 'Glm 5.3')
  assert.equal(titleCaseId(''), '')
})

test('saveDynamicModels / loadDynamicModels round-trip and degrade gracefully', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ogp-models-'))
  const path = join(dir, 'nested', 'models.json')
  saveDynamicModels(path, [{ id: 'glm-5.3', name: 'GLM-5.3' }])
  const loaded = loadDynamicModels(path)
  assert.deepEqual(loaded, [{ id: 'glm-5.3', name: 'GLM-5.3' }])

  // Missing / corrupt files load as an empty list.
  assert.deepEqual(loadDynamicModels(join(dir, 'does-not-exist.json')), [])
  const badPath = join(dir, 'bad.json')
  saveDynamicModels(badPath, [])
  assert.deepEqual(loadDynamicModels(badPath), [])
  // Non-array content is tolerated.
  writeFileSync(badPath, '{"not":"array"}')
  assert.deepEqual(loadDynamicModels(badPath), [])
  // Sanity: the round-trip wrote parseable JSON.
  assert.ok(JSON.parse(readFileSync(path, 'utf8')).length === 1)
})