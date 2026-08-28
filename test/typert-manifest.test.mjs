import assert from 'node:assert/strict'
import test from 'node:test'

// Validates the hand-written Typert host manifest against the REAL
// typert-loader validation (the exact gate the live host runs: a rejected
// manifest fails the whole plugin activation, which surfaces as HTTP 404 for
// every /api/opencodePool/* route). Skips when the loader is absent.

test('the host manifest passes the real typert-loader validation', async (t) => {
  let validateTypertManifest, TYPERT
  try {
    ;({ validateTypertManifest } = await import('@deepseek-ai/dsh-typert-loader'))
    ;({ TYPERT } = await import('../typert.host.js'))
  } catch {
    t.skip('dsh-typert-loader not installed')
    return
  }
  // Throws with a package-named message on any defect.
  const validated = validateTypertManifest('dsh-opencode-go-pool', TYPERT)
  assert.equal(validated.package, 'dsh-opencode-go-pool')
  assert.equal(validated.invocations.length, 9)
  for (const inv of validated.invocations) {
    assert.equal(inv.result.mode, 'strict', `${inv.method} result must be strict`)
  }
})
