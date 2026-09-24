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

test('plugin entry imports without settingsNamespace on the DSH 0.1.7 surface', () => {
  const result = spawnSync(process.execPath, [
    '--no-warnings',
    '--loader', loader,
    '--input-type=module',
    '--eval', `await import(${JSON.stringify(pluginEntry)})`,
  ], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('adapts the DSH 0.1.7 configEditor seam as a restart-scoped scope', async () => {
  const entry = { id: 'opencode-go-pool' }
  const current = { route: 'opencode-go', keys: [] }
  const edits = []
  const editor = {
    edit: async (target, change) => {
      assert.equal(target, entry)
      edits.push(change(current, {}))
    },
  }
  const ctx = { settings: {}, fiber: { config: current } }

  const scope = createSettingsScope(ctx, current, entry, editor)
  assert.equal(scope.get().route, 'opencode-go')
  assert.ok(Array.isArray(scope.get().keys))
  const dispose = scope.watch(() => { throw new Error('unexpected live watch on DSH 0.1.7') })
  assert.equal(typeof dispose, 'function')
  dispose()
  await scope.update({ preemptAtPercent: 80 })
  assert.deepEqual(edits, [{ route: 'opencode-go', keys: [], preemptAtPercent: 80 }])
  await assert.rejects(
    () => scope.update({
      keys: [
        { id: 'a', label: 'A', apiKeyEnv: 'OPENCODE_GO_KEY_A' },
        { id: 'b', label: 'B', apiKeyEnv: 'OPENCODE_GO_KEY_A' },
      ],
    }),
    /duplicate apiKeyEnv/,
  )
  assert.equal(edits.length, 1, 'a refused write never reaches configEditor.edit')
  await scope.replace({ route: 'opencode-go-pool', keys: [] })
  assert.equal(edits.length, 2)
  assert.deepEqual(edits[1], { route: 'opencode-go-pool', keys: [] })
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
