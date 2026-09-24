import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = pathToFileURL(join(here, 'current-dsh-settings.mjs')).href
const pluginEntry = pathToFileURL(join(here, '..', '..', 'index.js')).href

// Redirect only the plugin entry's direct @deepseek-ai/dsh-settings import to
// the DSH 0.1.7 surface (no settingsNamespace). Peer packages keep resolving
// from the dev tree; they are not the subject of this regression.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/dsh-settings' && context.parentURL === pluginEntry) {
    return { url: fixture, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
