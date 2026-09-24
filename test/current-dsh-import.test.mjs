import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { createSettingsScope } from '../index.js'
import { TYPERT } from '../typert.host.js'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoDir = dirname(testDir)
const pluginEntry = pathToFileURL(join(repoDir, 'index.js')).href
const loader = pathToFileURL(join(testDir, 'fixtures', 'current-settings-loader.mjs')).href

test('loads when settings has the DSH 0.1.7 export surface', () => {
  const result = spawnSync(process.execPath, [
    '--no-warnings',
    '--loader', loader,
    '--input-type=module',
    '--eval', `await import(${JSON.stringify(pluginEntry)})`,
  ], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('adapts the current config-editor seam for settings updates', async () => {
  const entry = { id: 'opencode-go-pool' }
  const current = { route: 'opencode-go', preemptAtPercent: 100 }
  const edits = []
  const listeners = []
  const editor = {
    edit: async (target, change) => {
      assert.equal(target, entry)
      edits.push(change(current, {}))
    },
  }
  const ctx = {
    settings: {},
    fiber: { entry, config: current },
    configEditor: editor,
    on: (event, callback) => {
      listeners.push({ event, callback })
      return () => {}
    },
  }

  const scope = createSettingsScope(ctx, current)
  assert.equal(scope.get(), current)
  scope.watch(() => {})
  await scope.update({ preemptAtPercent: 80 })
  assert.deepEqual(edits, [{ route: 'opencode-go', preemptAtPercent: 80 }])
  await assert.rejects(
    () => scope.update({
      keys: [
        { id: 'a', label: 'A', apiKeyEnv: 'OPENCODE_GO_KEY_A' },
        { id: 'b', label: 'B', apiKeyEnv: 'OPENCODE_GO_KEY_A' },
      ],
    }),
    /duplicate apiKeyEnv/,
  )
  assert.equal(listeners[0]?.event, 'internal/update')
})

test('declares the standard DSH bundle patch', async () => {
  const manifest = JSON.parse(await readFile(join(repoDir, 'package.json'), 'utf8'))
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  const patch = await readFile(join(repoDir, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: opencode-go-pool/)
  assert.match(patch, /name: dsh-opencode-go-pool/)
})

test('ships every invocation codec as strict with a create() factory', () => {
  assert.ok(TYPERT.invocations.length > 0)
  for (const invocation of TYPERT.invocations) {
    const codecs = [
      ...invocation.parameters.map(parameter => parameter.codec),
      invocation.result,
    ]
    for (const [index, codec] of codecs.entries()) {
      const where = `${invocation.id} codec #${index}`
      assert.equal(codec.mode, 'strict', `${where}: mode`)
      assert.equal(typeof codec.typeSymbol, 'string', `${where}: typeSymbol`)
      assert.ok(codec.schema, `${where}: schema`)
      assert.equal(typeof codec.create, 'function', `${where}: create`)
      assert.strictEqual(codec.create(), codec.schema, `${where}: create() returns the schema`)
    }
  }
})
