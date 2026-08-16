// Hand-written Typert host manifest for the opencodePool Remote.
// The typert-loader imports this via package.json exports["./typert"] and
// registers it into ctx.typert.local, which the Host gateway uses to claim
// and dispatch the "opencodePool/*" endpoints in strict mode.
//
// IMPORTANT: the typert-loader REQUIRES strict result codecs on EVERY
// invocation (src-json is rejected at manifest validation, which fails the
// whole plugin activation). Every result below is therefore a zod v4 schema;
// the business payload (status) is strict-validated before it crosses the
// wire, and the simple mutation results ride as strict booleans/strings.

import { z } from 'zod'

const windowSchema = z.object({
  status: z.string().nullable(),
  percent: z.number().nullable(),
  resetsAt: z.string().nullable(),
})

const usageSchema = z.object({
  rolling: windowSchema.nullable(),
  weekly: windowSchema.nullable(),
  monthly: windowSchema.nullable(),
})

const lastFailureSchema = z.object({
  code: z.string(),
  message: z.string(),
  at: z.string(),
})

const keyStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  apiKeyEnv: z.string(),
  state: z.string(),
  active: z.boolean(),
  usage: usageSchema.nullable(),
  usageError: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  credentialSet: z.boolean(),
  lastFailure: lastFailureSchema.nullable(),
})

const lastSwitchSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  reason: z.string(),
  at: z.string(),
})

const poolStatusSchema = z.object({
  takeover: z.string(),
  route: z.string(),
  usageRefreshMs: z.number(),
  preemptAtPercent: z.number(),
  activeId: z.string().nullable(),
  lastSwitch: lastSwitchSchema.nullable(),
  takeoverHint: z.string().nullable(),
  keys: z.array(keyStatusSchema),
})

const keyInputSchema = z.object({
  id: z.string(),
  label: z.string(),
  apiKeyEnv: z.string(),
})

const strict = (typeSymbol, schema) => ({ mode: 'strict', typeSymbol, schema })

const invocation = (method, parameters, result) => ({
  id: `dsh-opencode-go-pool#opencodePool/${method}`,
  service: 'opencodePool',
  namespace: 'opencodePool',
  method,
  invocation: { kind: 'direct' },
  parameters: parameters.map(({ name, wire, typeSymbol, schema }) => ({
    name, wire, source: 'json', codec: strict(typeSymbol, schema),
  })),
  result,
})

export const TYPERT = {
  package: 'dsh-opencode-go-pool',
  face: 'host',
  schemas: [],
  invocations: [
    invocation('status', [], strict('dsh-opencode-go-pool#PoolStatus', poolStatusSchema)),
    invocation('setActive', [
      { name: 'id', wire: 'id', typeSymbol: 'string', schema: z.string() },
    ], strict('boolean', z.boolean())),
    invocation('setDisabled', [
      { name: 'id', wire: 'id', typeSymbol: 'string', schema: z.string() },
      { name: 'on', wire: 'on', typeSymbol: 'boolean', schema: z.boolean() },
    ], strict('boolean', z.boolean())),
    invocation('clearInvalid', [
      { name: 'id', wire: 'id', typeSymbol: 'string', schema: z.string() },
    ], strict('boolean', z.boolean())),
    invocation('putKeys', [
      { name: 'keys', wire: 'keys', typeSymbol: 'dsh-opencode-go-pool#KeyInputList', schema: z.array(keyInputSchema) },
    ], strict('boolean', z.boolean())),
    invocation('putKeySecret', [
      { name: 'id', wire: 'id', typeSymbol: 'string', schema: z.string() },
      { name: 'secret', wire: 'secret', typeSymbol: 'string', schema: z.string() },
    ], strict('boolean', z.boolean())),
    invocation('takeOverState', [], strict('string', z.string())),
  ],
  model: { services: [], events: [], objects: [] },
}
