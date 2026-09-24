import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = pathToFileURL(join(here, 'current-dsh-settings.mjs')).href
const pluginEntry = pathToFileURL(join(here, '..', '..', 'index.js')).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/dsh-settings' && context.parentURL === pluginEntry) {
    return { url: fixture, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
