import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { KeyPool, assertKeyEntry, assertKeyList, QUOTA_CODE, INVALID_CREDENTIAL_CODE } from '../pool.js'

const KEYS = [
  { id: 'acc-a', label: '主号', apiKeyEnv: 'OPENCODE_GO_KEY_A' },
  { id: 'acc-b', label: '备用2', apiKeyEnv: 'OPENCODE_GO_KEY_B' },
  { id: 'acc-c', label: '备用3', apiKeyEnv: 'OPENCODE_GO_KEY_C' },
]

function freshPool(stateFile = null) {
  return new KeyPool({ stateFile })
}

test('assertKeyEntry rejects malformed entries', () => {
  assert.throws(() => assertKeyEntry({}), /must be an object|key id/)
  assert.throws(() => assertKeyEntry({ id: 'BAD ID', label: 'x', apiKeyEnv: 'K' }), /must match/)
  assert.throws(() => assertKeyEntry({ id: 'ok', label: '  ', apiKeyEnv: 'K' }), /label/)
  assert.throws(() => assertKeyEntry({ id: 'ok', label: 'x', apiKeyEnv: '1bad' }), /credential reference/)
  assertKeyEntry({ id: 'acc-a', label: '主号', apiKeyEnv: 'OPENCODE_GO_KEY_A' })
})

test('assertKeyList rejects duplicate ids and duplicate env refs', () => {
  assert.throws(() => assertKeyList([KEYS[0], KEYS[0]]), /duplicate key id/)
  assert.throws(() => assertKeyList([KEYS[0], { ...KEYS[1], id: 'acc-x', apiKeyEnv: KEYS[0].apiKeyEnv }]), /duplicate apiKeyEnv/)
  assertKeyList(KEYS)
})

test('first key becomes active; selection is sticky', () => {
  const pool = freshPool()
  pool.syncKeys(KEYS)
  assert.equal(pool.currentKey().id, 'acc-a')
  pool.setActive('acc-b')
  assert.equal(pool.currentKey().id, 'acc-b')
})

test('quota failure marks the key exhausted and rotates to the next', () => {
  const pool = freshPool()
  pool.syncKeys(KEYS)
  const rotation = pool.onFailure('acc-a', { code: QUOTA_CODE, message: 'quota' })
  assert.deepEqual(rotation, { from: 'acc-a', to: 'acc-b' })
  assert.equal(pool.stateOf('acc-a').state, 'exhausted')
  assert.equal(pool.currentKey().id, 'acc-b')
  assert.equal(pool.lastSwitch.reason, 'quota')
})

test('credential failure marks invalid and rotates; invalid keys never revive on usage', () => {
  const pool = freshPool()
  pool.syncKeys(KEYS)
  pool.onFailure('acc-a', { code: INVALID_CREDENTIAL_CODE, message: 'bad' })
  assert.equal(pool.stateOf('acc-a').state, 'invalid')
  assert.equal(pool.currentKey().id, 'acc-b')
  pool.onUsage('acc-a', { rolling: { status: 'ok', percent: 0 }, weekly: null, monthly: null })
  assert.equal(pool.stateOf('acc-a').state, 'invalid')
})

test('transient codes do not rotate', () => {
  const pool = freshPool()
  pool.syncKeys(KEYS)
  const rotation = pool.onFailure('acc-a', { code: 'RATE_LIMIT', message: 'slow down' })
  assert.equal(rotation, null)
  assert.equal(pool.stateOf('acc-a').state, 'healthy')
  assert.equal(pool.currentKey().id, 'acc-a')
})

test('when every key is exhausted the pool is dry', () => {
  const pool = freshPool()
  pool.syncKeys(KEYS)
  for (const key of ['acc-a', 'acc-b', 'acc-c']) pool.onFailure(key, { code: QUOTA_CODE })
  assert.equal(pool.currentKey(), null)
  assert.equal(pool.usableCount(), 0)
})

test('exhausted keys revive once rolling usage reports ok below threshold', () => {
  const pool = freshPool()
  pool.syncKeys(KEYS)
  pool.onFailure('acc-a', { code: QUOTA_CODE })
  assert.equal(pool.currentKey().id, 'acc-b')
  pool.onUsage('acc-a', { rolling: { status: 'ok', percent: 3 }, weekly: null, monthly: null })
  assert.equal(pool.stateOf('acc-a').state, 'healthy')
  pool.setActive('acc-a')
  assert.equal(pool.currentKey().id, 'acc-a')
})

test('preemptAtPercent skips healthy keys near exhaustion', () => {
  const pool = freshPool()
  pool.setPreempt(98)
  pool.syncKeys(KEYS)
  pool.onUsage('acc-a', { rolling: { status: 'ok', percent: 99 }, weekly: null, monthly: null })
  assert.equal(pool.currentKey().id, 'acc-b')
  // Relaxing the threshold makes the key eligible again, but the sticky
  // active selection stays put — no flapping; manual switch can take it back.
  pool.setPreempt(100)
  assert.equal(pool.usableCount(), 3)
  assert.equal(pool.currentKey().id, 'acc-b')
  pool.setActive('acc-a')
  assert.equal(pool.currentKey().id, 'acc-a')
})

test('disable removes a key from selection; enable restores it', () => {
  const pool = freshPool()
  pool.syncKeys(KEYS)
  pool.setDisabled('acc-a', true)
  assert.equal(pool.currentKey().id, 'acc-b')
  pool.setDisabled('acc-a', false)
  assert.equal(pool.stateOf('acc-a').state, 'healthy')
  pool.setActive('acc-a')
  assert.equal(pool.currentKey().id, 'acc-a')
})

test('syncKeys keeps surviving state and drops removed ids', () => {
  const pool = freshPool()
  pool.syncKeys(KEYS)
  pool.onFailure('acc-a', { code: QUOTA_CODE })
  pool.syncKeys([KEYS[0], KEYS[1]])
  assert.equal(pool.stateOf('acc-a').state, 'exhausted')
  assert.equal(pool.stateOf('acc-c').state, 'healthy') // default for unknown id
  assert.equal(pool.keys.length, 2)
})

test('state file round-trips across a fresh pool instance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-opencode-go-pool-'))
  const stateFile = join(dir, 'pool.state.json')
  const a = new KeyPool({ stateFile })
  a.syncKeys(KEYS)
  a.onFailure('acc-a', { code: QUOTA_CODE })
  a.setDisabled('acc-c', true)
  a.setActive('acc-b')

  const b = new KeyPool({ stateFile })
  b.syncKeys(KEYS)
  assert.equal(b.stateOf('acc-a').state, 'exhausted')
  assert.equal(b.stateOf('acc-c').state, 'disabled')
  assert.equal(b.activeId, 'acc-b')
  assert.equal(b.lastSwitch.reason, 'quota')
  assert.ok(readFileSync(stateFile, 'utf8').includes('"version": 1'))
})

test('corrupt state file starts fresh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-opencode-go-pool-'))
  const stateFile = join(dir, 'pool.state.json')
  writeFileSync(stateFile, '{not json')
  const pool = new KeyPool({ stateFile })
  pool.syncKeys(KEYS)
  assert.equal(pool.currentKey().id, 'acc-a')
})
