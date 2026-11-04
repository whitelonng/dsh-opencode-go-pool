// Local harness for the client half: loads the bundle through the module
// loader protocol, mounts it against a stubbed Client context, and checks the
// Remote contribution plus the settings-page registration.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

let captured
globalThis.window = { __ModuleLoader__: { load: definition => { captured = definition } } }

await import(pathToFileURL('D:/sources/pub-repo/dsh-opencode-go-pool/client.js').href)
if (!captured) throw new Error('client.js did not register a module factory')
console.log('module id:', captured.id)

const hookState = []
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  Fragment: 'Fragment',
  useState: initial => { const pair = [initial, () => {}]; hookState.push(pair); return pair },
  useEffect: () => {},
  useCallback: fn => fn,
  useMemo: fn => fn(),
  useRef: () => ({ current: undefined }),
  Component: class { constructor(props) { this.props = props; this.state = {} } },
}
function requireModule(name) {
  if (name === 'react') return React
  throw new Error(`unexpected module request: ${name}`)
}

const module = captured.factory(requireModule)
console.log('inject:', module.inject)

// A stub Client Remote contribution validator: the real binder refuses any
// codec without `mode: 'strict'` and a `create()` schema factory.
function validateContribution(contribution) {
  if (typeof contribution.package !== 'string') throw new Error('contribution.package missing')
  for (const descriptor of contribution.descriptors) {
    if (!descriptor.namespace || !descriptor.method) throw new Error('descriptor namespace/method missing')
    if (descriptor.invocation?.kind !== 'direct') throw new Error('descriptor invocation kind missing')
    const codecs = [...descriptor.parameters.map(p => p.codec), descriptor.result]
    for (const codec of codecs) {
      if (codec.mode !== 'strict') throw new Error(`codec for ${descriptor.method} is not strict`)
      if (typeof codec.create !== 'function') throw new Error(`codec for ${descriptor.method} has no create()`)
      if (typeof codec.create().parse !== 'function') throw new Error(`codec for ${descriptor.method} create() returns no parser`)
    }
  }
  return contribution.descriptors.length
}

const registered = []
const remoteCalls = []
const fakeRemote = {
  async status() {
    remoteCalls.push('status')
    return { ok: true, value: {
      takeover: 'serving', route: 'opencode-go', usageRefreshMs: 30000, preemptAtPercent: 100,
      switchAfterConsecutiveFailures: 0, modelMode: 'all', availableModels: [],
      activeId: 'a', lastSwitch: null, takeoverHint: null,
      keys: [{ id: 'a', label: 'A', apiKeyEnv: 'OPENCODE_GO_KEY_A', state: 'healthy', active: true,
        usage: { rolling: { status: 'ok', percent: 12, resetsAt: new Date(Date.now() + 3.6e6).toISOString() }, weekly: null, monthly: null },
        usageError: null, fetchedAt: new Date().toISOString(), credentialSet: true, lastFailure: null }],
    } }
  },
}

const ctx = {
  remote: {
    async $mount(contribution) {
      const count = validateContribution(contribution)
      console.log('$mount accepted descriptors:', count, 'package:', contribution.package)
      return async () => {}
    },
  },
  get: key => (key === 'remote.opencodePool' ? fakeRemote : undefined),
  slots: {
    inject: (key, callback) => { callback(); return () => {} },
    register: (options, component) => { registered.push({ options, component }); return () => {} },
  },
  locale: {
    register: (ns, dicts) => { console.log('locale namespace:', ns, 'locales:', Object.keys(dicts)); return () => {} },
    bind: ns => key => `${ns}.${key}`,
  },
  effect: fn => { const dispose = fn(); return dispose },
}

module.apply(ctx)
console.log('registered sections:', registered.map(r => ({ name: r.options.name, id: r.options.id, order: r.options.order })))

const section = registered[0]
if (!section || section.options.name !== 'settings.section') throw new Error('no settings.section registration')

const props = section.options.inject()
console.log('injected props:', Object.keys(props))
const Component = section.component
// The registration is a class error boundary wrapping the page; instantiate
// classes and call function components.
let tree
try {
  tree = Component({ ...props })
} catch {
  tree = new Component({ ...props })
}
console.log('rendered root type:', typeof tree?.type === 'string' ? tree.type : (tree?.type?.name || 'component'))
await props.api()
console.log('remote reachable:', remoteCalls)
console.log('OK')
process.exit(0)

