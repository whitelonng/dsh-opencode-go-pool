// Hand-written Typert host manifest for the opencodePool Remote.
// The typert-loader imports this via package.json exports["./typert"] and
// registers it into ctx.typert.local, which the Host gateway uses to claim
// and dispatch the "opencodePool/*" endpoints in strict mode. Mutation
// results are simple values, so they ride as src-json; the business payload
// (status) is strict-validated against zod on the Host side before it
// crosses the wire.

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

const direct = invocation => ({ ...invocation, invocation: { kind: 'direct' } })
const srcJson = () => ({ mode: 'src-json' })

export const TYPERT = {
  package: 'dsh-opencode-go-pool',
  face: 'host',
  schemas: [],
  invocations: [
    direct({
      id: 'dsh-opencode-go-pool#opencodePool/status',
      service: 'opencodePool',
      namespace: 'opencodePool',
      method: 'status',
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-opencode-go-pool#PoolStatus',
        schema: poolStatusSchema,
      },
    }),
    direct({
      id: 'dsh-opencode-go-pool#opencodePool/setActive',
      service: 'opencodePool',
      namespace: 'opencodePool',
      method: 'setActive',
      parameters: [{ name: 'id', wire: 'id', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: z.string() } }],
      result: srcJson(),
    }),
    direct({
      id: 'dsh-opencode-go-pool#opencodePool/setDisabled',
      service: 'opencodePool',
      namespace: 'opencodePool',
      method: 'setDisabled',
      parameters: [
        { name: 'id', wire: 'id', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: z.string() } },
        { name: 'on', wire: 'on', source: 'json', codec: { mode: 'strict', typeSymbol: 'boolean', schema: z.boolean() } },
      ],
      result: srcJson(),
    }),
    direct({
      id: 'dsh-opencode-go-pool#opencodePool/clearInvalid',
      service: 'opencodePool',
      namespace: 'opencodePool',
      method: 'clearInvalid',
      parameters: [{ name: 'id', wire: 'id', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: z.string() } }],
      result: srcJson(),
    }),
    direct({
      id: 'dsh-opencode-go-pool#opencodePool/putKeys',
      service: 'opencodePool',
      namespace: 'opencodePool',
      method: 'putKeys',
      parameters: [{ name: 'keys', wire: 'keys', source: 'json', codec: { mode: 'strict', typeSymbol: 'dsh-opencode-go-pool#KeyInputList', schema: z.array(keyInputSchema) } }],
      result: srcJson(),
    }),
    direct({
      id: 'dsh-opencode-go-pool#opencodePool/takeOverState',
      service: 'opencodePool',
      namespace: 'opencodePool',
      method: 'takeOverState',
      parameters: [],
      result: srcJson(),
    }),
  ],
  model: { services: [], events: [], objects: [] },
}
