import { Context } from '@deepseek-ai/cordis'
import OpenCodeGoPool from '../index.js'
const KEY = process.env.OPENCODE_KEY
const app = new Context()
app.provide('llm', { registerAdapter(){ const h=()=>{}; h.replace=()=>{}; return h } })
app.provide('credentials', { async resolve(ref){ const s=String(ref); if (s.includes('BAD')) return { value:'oc_sk_000000000000_FAKEKEYFAKEKEYFAKEKEYFAKEKEYFAKE' }; if (s.includes('GOOD')) return { value: KEY }; return undefined }, async set(){}, async readRecord(){}, async listRecords(){ return [] } })
const plugin = new OpenCodeGoPool(app, { route:'opencode-go', keys:[{id:'bad',label:'Bad',apiKeyEnv:'OPENCODE_GO_KEY_BAD'},{id:'good',label:'Good',apiKeyEnv:'OPENCODE_GO_KEY_GOOD'}], modelMode:'all', usageBaseUrl:'https://opencode.ai/zen/go/v1/usage', modelsBaseUrl:'https://opencode.ai/zen/go/v1/models', usageRefreshMs:30000, timeoutMs:15000, preemptAtPercent:100, switchAfterConsecutiveFailures:0 })
const route = plugin.servingRoute
console.log('active before:', plugin.pool.activeId, 'usable:', plugin.pool.usableCount())
let text='', reason='(none)'
for await (const c of plugin.poolAdapter.stream({ provider:route, model:'glm-5.3', sessionId:'ses_failover', maxTokens:48, messages:[{role:'user',content:[{type:'text',text:'Reply with exactly: pool-ok'}]}] })) {
  if (c.type==='text-delta') text+=c.text
  if (c.type==='finish') reason = c.reason.kind + (c.reason.failure? ':'+c.reason.failure.code : '')
}
console.log('stream:', reason, JSON.stringify(text))
console.log('active after:', plugin.pool.activeId, 'lastSwitch:', JSON.stringify(plugin.pool.lastSwitch))
console.log('key states:', plugin.pool.entries().map(e=>({id:e.id, state:plugin.pool.stateOf(e.id).state})))
process.exit(0)

