import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchUsage, UsageCache, UsageError } from '../usage.js'

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

test('fetchUsage parses the documented three-window shape', async () => {
  const fetchImpl = async () => fakeResponse(200, {
    usage: {
      rolling: { status: 'ok', percent: 9, resetsAt: '2026-08-14T07:20:04.810Z' },
      weekly: { status: 'ok', percent: 12, resetsAt: '2026-08-17T00:00:00.810Z' },
      monthly: { status: 'ok', percent: 6, resetsAt: '2026-09-09T00:41:03.810Z' },
    },
  })
  const usage = await fetchUsage({ baseUrl: 'https://x/v1/usage', apiKey: 'k', fetchImpl })
  assert.equal(usage.rolling.percent, 9)
  assert.equal(usage.weekly.percent, 12)
  assert.equal(usage.monthly.resetsAt, '2026-09-09T00:41:03.810Z')
})

test('fetchUsage clamps out-of-range percent and tolerates shape drift', async () => {
  const fetchImpl = async () => fakeResponse(200, { usage: { rolling: { percent: 250 }, weekly: null, monthly: 'nope' } })
  const usage = await fetchUsage({ baseUrl: 'u', apiKey: 'k', fetchImpl })
  assert.equal(usage.rolling.percent, 100)
  assert.equal(usage.weekly, null)
  assert.equal(usage.monthly, null)
})

test('fetchUsage classifies 401 as unauthorized', async () => {
  const fetchImpl = async () => fakeResponse(401, { error: 'nope' }, false)
  await assert.rejects(
    () => fetchUsage({ baseUrl: 'u', apiKey: 'k', fetchImpl }),
    err => err instanceof UsageError && err.code === 'unauthorized',
  )
})

test('fetchUsage classifies other http errors with their status', async () => {
  const fetchImpl = async () => fakeResponse(503, 'busy', false)
  await assert.rejects(
    () => fetchUsage({ baseUrl: 'u', apiKey: 'k', fetchImpl }),
    err => err instanceof UsageError && err.code === 'http-503',
  )
})

test('fetchUsage classifies broken JSON', async () => {
  const fetchImpl = async () => fakeResponse(200, 'not json')
  await assert.rejects(
    () => fetchUsage({ baseUrl: 'u', apiKey: 'k', fetchImpl }),
    err => err instanceof UsageError && err.code === 'bad-json',
  )
})

test('fetchUsage classifies network failures', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed') }
  await assert.rejects(
    () => fetchUsage({ baseUrl: 'u', apiKey: 'k', fetchImpl }),
    err => err instanceof UsageError && err.code === 'network',
  )
})

test('UsageCache serves fresh values, dedupes in-flight, never caches failures', async () => {
  let now = 1000000
  let calls = 0
  const cache = new UsageCache({ ttlMs: 1000, now: () => now })
  const fetcher = async () => {
    calls += 1
    if (calls === 1) throw new UsageError('network', 'down')
    return calls
  }
  await assert.rejects(() => cache.get('a', fetcher))
  assert.equal(calls, 1)
  const [x, y] = await Promise.all([cache.get('a', fetcher), cache.get('a', fetcher)])
  assert.equal(x, 2)
  assert.equal(y, 2)
  assert.equal(calls, 2) // one fetch served both in-flight waiters
  now += 2000
  const z = await cache.get('a', fetcher)
  assert.equal(z, 3)
  assert.equal(calls, 3)
})
