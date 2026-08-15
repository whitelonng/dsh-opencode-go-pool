import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

// Client-bundle execution tests: the bundle had only been syntax-checked;
// these tests actually EXECUTE it (window stub + react), run apply() against a
// mock slot/locale/remote context, and server-render the captured settings
// section plus its inner cards. They skip when react/react-dom are absent
// (fresh clone without the DSH node_modules).

const here = dirname(fileURLToPath(import.meta.url))
const clientUrl = pathToFileURL(join(here, '..', 'client.js')).href

async function loadReact(t) {
  let React, renderToString
  try {
    React = (await import('react')).default
    ;({ renderToString } = await import('react-dom/server'))
  } catch {
    t.skip('react/react-dom not installed')
    return null
  }
  return { React, renderToString }
}

/** Execute the bundle under a window stub; returns its module exports. */
async function loadClientBundle(t) {
  let spec
  const previousWindow = globalThis.window
  globalThis.window = {
    __ModuleLoader__: {
      load: entry => { spec = entry },
    },
  }
  try {
    // Cache-busting query: each test gets a fresh evaluation of the bundle.
    await import(`${clientUrl}?case=${Date.now()}-${Math.random()}`)
  } finally {
    globalThis.window = previousWindow
  }
  assert.ok(spec, 'bundle registers its factory')
  assert.equal(spec.id, 'dsh-opencode-go-pool')
  return spec
}

test('bundle executes and apply() registers the settings section', async (t) => {
  const harness = await loadReact(t)
  if (!harness) return
  const { React } = harness
  const spec = await loadClientBundle(t)

  const module = spec.factory(name => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })

  let registration
  const ctx = {
    remote: { $mount: async () => {} },
    effect: (fn) => { const dispose = fn(); return () => (typeof dispose === 'function' ? dispose() : undefined) },
    locale: {
      register: () => () => {},
      bind: () => key => key,
    },
    slots: {
      register: (opts, component) => { registration = { ...opts, component } },
      inject: (_name, factory) => { factory() },
    },
    get: () => null,
  }
  module.apply(ctx)

  assert.equal(registration.name, 'settings.section')
  assert.equal(registration.id, 'opencode-go-pool')
  assert.equal(registration.order, 41)
  assert.equal(typeof registration.component, 'function')
  assert.equal(typeof registration.label(), 'string')
})

test('the settings page renders its initial loading state', async (t) => {
  const harness = await loadReact(t)
  if (!harness) return
  const { React, renderToString } = harness
  const spec = await loadClientBundle(t)
  const module = spec.factory(name => (name === 'react' ? React : (() => { throw new Error(name) })()))

  let registration
  module.apply({
    remote: { $mount: async () => {} },
    effect: (fn) => { fn(); return () => {} },
    locale: { register: () => () => {}, bind: () => key => key },
    slots: {
      register: (opts, component) => { registration = { ...opts, component } },
      inject: (_name, factory) => { factory() },
    },
    get: () => null,
  })

  const html = renderToString(React.createElement(registration.component, {
    t: key => key,
    api: async () => ({ status: async () => ({}) }),
  }))
  assert.ok(html.includes('title'), 'renders the page title')
  assert.ok(html.includes('loading'), 'renders the loading state')
})

test('KeyCard renders usage bars, badges, and reset countdowns', async (t) => {
  const harness = await loadReact(t)
  if (!harness) return
  const { React, renderToString } = harness
  const spec = await loadClientBundle(t)
  const module = spec.factory(name => (name === 'react' ? React : (() => { throw new Error(name) })()))
  const { KeyCard } = module.__test

  const resetTarget = Date.now() + (2 * 60 + 13) * 60000 + 10000 // +10s margin against floor()
  const item = {
    id: 'acc-a',
    label: '主号',
    apiKeyEnv: 'OPENCODE_GO_KEY_A',
    state: 'healthy',
    active: true,
    usage: {
      rolling: { status: 'ok', percent: 9, resetsAt: new Date(resetTarget).toISOString() },
      weekly: { status: 'ok', percent: 12, resetsAt: new Date(resetTarget).toISOString() },
      monthly: { status: 'ok', percent: 6, resetsAt: new Date(resetTarget).toISOString() },
    },
    usageError: null,
    fetchedAt: null,
    lastFailure: null,
  }
  const html = renderToString(React.createElement(KeyCard, {
    item, t: key => key, tick: Date.now(), busy: null, onAction: () => {},
  }))
  assert.ok(html.includes('主号'), 'shows the label')
  assert.ok(html.includes('OPENCODE_GO_KEY_A'), 'shows the credential ref')
  assert.ok(html.includes('activeBadge'), 'shows the in-use badge')
  assert.ok(html.includes('rolling') && html.includes('weekly') && html.includes('monthly'), 'shows all three windows')
  assert.ok(html.includes('9%'), 'rolling used percent')
  assert.ok(html.includes('91%'), 'rolling remaining percent')
  assert.ok(html.includes('2h 13m'), 'reset countdown renders')
  assert.ok(!html.includes('switchNow'), 'no switch button while this key is active')
})

test('KeyCard renders failure badges and error text without usage data', async (t) => {
  const harness = await loadReact(t)
  if (!harness) return
  const { React, renderToString } = harness
  const spec = await loadClientBundle(t)
  const module = spec.factory(name => (name === 'react' ? React : (() => { throw new Error(name) })()))
  const { KeyCard } = module.__test

  const html = renderToString(React.createElement(KeyCard, {
    item: {
      id: 'acc-b',
      label: '备用2',
      apiKeyEnv: 'OPENCODE_GO_KEY_B',
      state: 'exhausted',
      active: false,
      usage: null,
      usageError: 'http-503',
      fetchedAt: null,
      lastFailure: { code: 'QUOTA', message: 'quota', at: new Date().toISOString() },
    },
    t: key => key, tick: Date.now(), busy: null, onAction: () => {},
  }))
  assert.ok(html.includes('exhaustedBadge'), 'shows the exhausted badge')
  assert.ok(html.includes('httpError'), 'shows the usage error text')
  assert.ok(html.includes('switchNow'), 'offers manual switch for a non-active key')
  assert.ok(html.includes('disable'), 'offers disable')
})

test('the bundle exposes no literal secrets anywhere', async () => {
  const source = readFileSync(join(here, '..', 'client.js'), 'utf8')
  assert.ok(!/sk-opencode-[A-Za-z0-9]+/.test(source), 'no literal OpenCode keys in the bundle')
})
