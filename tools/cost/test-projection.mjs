import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// Validate the sessionCost projection against a real session log.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { readSession } from './session-log.mjs'

const PACK = packPath('dsh-session-cost')
const { normalizeTable, isPeakTime, UNKNOWN_MODEL } = await import(`file:///${PACK}/lib/pricing.js`)
const { createDefinition } = await import(`file:///${PACK}/lib/index.js`)

const table = normalizeTable(JSON.parse(fs.readFileSync(`${PACK}/prices.json`, 'utf8')))
assert.ok(table, 'price table must normalize')
const loader = { get: () => table }

let failures = 0
const check = (label, fn) => {
  try { fn(); console.log(`  ok   ${label}`) } catch (error) { failures++; console.log(`  FAIL ${label}: ${error.message}`) }
}

// ── peak windows ────────────────────────────────────────────────────────────
console.log('peak window resolution (UTC, windows 01-04 and 06-10, Mon-Fri):')
const at = (iso) => Date.parse(iso)
const cases = [
  ['2026-09-14T00:59:00Z', false, 'Monday 00:59 — before the window'],
  ['2026-09-14T01:00:00Z', true, 'Monday 01:00 — window start (inclusive)'],
  ['2026-09-14T03:59:00Z', true, 'Monday 03:59 — inside'],
  ['2026-09-14T04:00:00Z', false, 'Monday 04:00 — window end (exclusive)'],
  ['2026-09-14T05:30:00Z', false, 'Monday 05:30 — between windows'],
  ['2026-09-14T06:00:00Z', true, 'Monday 06:00 — second window start'],
  ['2026-09-14T09:59:00Z', true, 'Monday 09:59 — inside'],
  ['2026-09-14T10:00:00Z', false, 'Monday 10:00 — second window end'],
  ['2026-09-19T02:00:00Z', false, 'Saturday 02:00 — weekend is off-peak'],
  ['2026-09-20T07:00:00Z', false, 'Sunday 07:00 — weekend is off-peak'],
  ['2026-09-18T23:30:00Z', false, 'Friday 23:30 — off-peak'],
]
for (const [iso, expected, label] of cases) {
  check(label, () => assert.equal(isPeakTime(at(iso), table.peak), expected))
}

// ── table hygiene ───────────────────────────────────────────────────────────
console.log('\nprice table:')
check('garbage is rejected instead of throwing', () => {
  assert.equal(normalizeTable(null), undefined)
  assert.equal(normalizeTable({ peak: {}, models: {} }), undefined)
  assert.equal(normalizeTable({ peak: { weekdaysUtc: [], windowsUtc: [] }, models: 'nope' }), undefined)
})
check('a malformed model is dropped, the rest kept', () => {
  const partial = normalizeTable({
    peak: { weekdaysUtc: [1], windowsUtc: [{ from: 1, to: 2 }] },
    models: { good: { input: { peak: 1, offPeak: 0.5 }, cacheHit: { peak: 0.1, offPeak: 0.05 }, output: { peak: 2, offPeak: 1 } }, bad: { input: { peak: 1 } } }
  })
  assert.deepEqual(Object.keys(partial.models), ['good'])
})
check('official flash rates match the docs', () => {
  assert.deepEqual(table.models['deepseek-flash'].input, { peak: 0.3, offPeak: 0.15 })
  assert.deepEqual(table.models['deepseek-flash'].cacheHit, { peak: 0.006, offPeak: 0.003 })
  assert.deepEqual(table.models['deepseek-flash'].output, { peak: 1.2, offPeak: 0.6 })
})
check('official pro rates match the docs', () => {
  assert.deepEqual(table.models['deepseek-v4-pro'].input, { peak: 1.32, offPeak: 0.66 })
  assert.deepEqual(table.models['deepseek-v4-pro'].cacheHit, { peak: 0.044, offPeak: 0.022 })
  assert.deepEqual(table.models['deepseek-v4-pro'].output, { peak: 3.96, offPeak: 1.98 })
})

// ── the real session ────────────────────────────────────────────────────────
const file = process.argv[2] ?? newestSessionLog()
const events = readSession(file)
console.log(`\nreal session: ${events.length} events`)

const definition = createDefinition(loader)
let state = definition.init({ version: 3, id: 'test', createdAt: 0, isSeeded: false }, 0)
const prior = []
for (const event of events) {
  const next = definition.apply(state, event)
  assert.ok(next !== null && typeof next === 'object', 'apply must return a state')
  prior.push(state)
  state = next
}
check('every intermediate state validates against stateSchema', () => {
  for (const snapshot of prior) definition.stateSchema.parse(snapshot)
})
check('the final state validates against stateSchema', () => definition.stateSchema.parse(state))

const view = definition.wire.view(state)
check('the view validates against viewSchema', () => definition.wire.viewSchema.parse(view))

// Independent recomputation straight from the log, bucket by bucket.
const expected = { miss: 0, hit: 0, out: 0, requests: 0, missUsd: 0, hitUsd: 0, outUsd: 0 }
let route = null
let stepTier = null
for (const event of events) {
  if (event.type === 'step/start') stepTier = isPeakTime(event.time, table.peak) ? 'peak' : 'offPeak'
  if (event.type === 'request/header') route = event.data.header.config.model
  if (event.type !== 'assistant/message' || event.data.usage === undefined || event.data.usage === null) continue
  const usage = event.data.usage
  const tier = stepTier ?? (isPeakTime(event.time, table.peak) ? 'peak' : 'offPeak')
  const price = table.models[table.aliases[route] ?? route]
  assert.ok(price, `route ${route} must be priced in this session`)
  expected.miss += usage.inputTokens ?? 0
  expected.hit += usage.cacheReadTokens ?? 0
  expected.out += usage.outputTokens ?? 0
  expected.requests += 1
  expected.missUsd += ((usage.inputTokens ?? 0) / 1e6) * price.input[tier]
  expected.hitUsd += ((usage.cacheReadTokens ?? 0) / 1e6) * price.cacheHit[tier]
  expected.outUsd += ((usage.outputTokens ?? 0) / 1e6) * price.output[tier]
}
console.log('\nfolded view:')
console.log(`  requests        ${view.requests}`)
console.log(`  input miss      $${view.cost.miss.toFixed(6)}   (${expected.miss} tokens)`)
console.log(`  input hit       $${view.cost.hit.toFixed(6)}   (${expected.hit} tokens)`)
console.log(`  output          $${view.cost.out.toFixed(6)}   (${expected.out} tokens)`)
console.log(`  cache write     $${view.cost.write.toFixed(6)}`)
console.log(`  total           $${view.total.toFixed(6)}`)
console.log(`  view keys       ${Object.keys(view).join(', ')}`)

check('request count matches the independent count', () => assert.equal(view.requests, expected.requests))
check('each bucket matches the independent recomputation', () => {
  assert.ok(Math.abs(view.cost.miss - expected.missUsd) < 1e-12, `miss ${view.cost.miss} vs ${expected.missUsd}`)
  assert.ok(Math.abs(view.cost.hit - expected.hitUsd) < 1e-12, `hit ${view.cost.hit} vs ${expected.hitUsd}`)
  assert.ok(Math.abs(view.cost.out - expected.outUsd) < 1e-12, `out ${view.cost.out} vs ${expected.outUsd}`)
})
check('the total is exactly the sum of the three billed buckets', () => {
  assert.ok(Math.abs(view.total - (view.cost.miss + view.cost.hit + view.cost.out)) < 1e-12)
})
check('DeepSeek charges no cache write, so its line is zero', () => assert.equal(view.cost.write, 0))
check('the session priced completely', () => {
  assert.equal(view.unpricedRequests, 0)
  assert.equal(view.pricedRequests, view.requests)
  assert.equal(view.complete, true)
})
check('the view carries the panel addends and nothing else', () => {
  assert.deepEqual(Object.keys(view).sort(), ['complete', 'cost', 'currency', 'pricedRequests', 'requests', 'total', 'unpricedRequests'])
})
check('the total is inside the all-peak ceiling and above the all-off-peak floor', () => {
  const flash = table.models['deepseek-flash']
  const allPeak = (expected.miss / 1e6) * flash.input.peak + (expected.hit / 1e6) * flash.cacheHit.peak + (expected.out / 1e6) * flash.output.peak
  assert.ok(view.total <= allPeak + 1e-9, `total ${view.total} must not exceed the all-peak ${allPeak}`)
  assert.ok(view.total >= allPeak / 2 - 1e-9)
})

// ── unpriced and empty cases ────────────────────────────────────────────────
console.log('\nedge cases:')
const empty = definition.init({ version: 3, id: 'x', createdAt: 0, isSeeded: false }, 0)
const emptyView = definition.wire.view(empty)
check('an empty session prices to zero and is not "complete"', () => {
  definition.wire.viewSchema.parse(emptyView)
  assert.equal(emptyView.total, 0)
  assert.equal(emptyView.requests, 0)
  assert.equal(emptyView.complete, false)
  assert.deepEqual(emptyView.cost, { miss: 0, hit: 0, write: 0, out: 0 })
})
check('an unknown model is reported unpriced, never guessed', () => {
  let s = definition.init({ version: 3, id: 'x', createdAt: 0, isSeeded: false }, 0)
  s = definition.apply(s, { type: 'request/header', seq: 1, time: at('2026-09-14T02:00:00Z'), data: { header: { config: { provider: 'deepseek-official', model: 'some-future-model' } } } })
  s = definition.apply(s, { type: 'assistant/message', seq: 2, time: at('2026-09-14T02:00:01Z'), data: { turn: 1, step: 1, stream: [], usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } } })
  const v = definition.wire.view(s)
  definition.wire.viewSchema.parse(v)
  assert.equal(v.total, 0)
  assert.equal(v.unpricedRequests, 1)
  assert.equal(v.pricedRequests, 0)
  assert.equal(v.complete, false)
})
check('a message before any route is billed to the unknown-model bucket', () => {
  let s = definition.init({ version: 3, id: 'x', createdAt: 0, isSeeded: false }, 0)
  s = definition.apply(s, { type: 'assistant/message', seq: 1, time: at('2026-09-14T02:00:01Z'), data: { turn: 1, step: 1, stream: [], usage: { inputTokens: 10, outputTokens: 10 } } })
  const v = definition.wire.view(s)
  assert.equal(v.unpricedRequests, 1)
  assert.equal(v.total, 0)
  assert.equal(s.buckets[UNKNOWN_MODEL].peak.miss, 10)
})
check('a missing usage record is counted, not priced', () => {
  let s = definition.init({ version: 3, id: 'x', createdAt: 0, isSeeded: false }, 0)
  s = definition.apply(s, { type: 'assistant/message', seq: 1, time: 0, data: { turn: 1, step: 1, stream: [] } })
  assert.equal(s.usageMissing, 1)
  assert.equal(s.requests, 0)
  assert.equal(definition.wire.view(s).total, 0)
})
check('the fold never mutates a state it already returned', () => {
  let s = definition.init({ version: 3, id: 'x', createdAt: 0, isSeeded: false }, 0)
  const usageEvent = { type: 'assistant/message', seq: 1, time: at('2026-09-14T02:00:01Z'), data: { turn: 1, step: 1, stream: [], usage: { inputTokens: 100, outputTokens: 100 } } }
  s = definition.apply(s, { type: 'request/header', seq: 0, time: 0, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-flash' } } } })
  const before = JSON.stringify(s)
  definition.apply(s, usageEvent)
  assert.equal(JSON.stringify(s), before, 'the previous state must be untouched')
})
check('a table reload reprices without refolding', () => {
  let current = table
  const definition2 = createDefinition({ get: () => current })
  let s = definition2.init({ version: 3, id: 'x', createdAt: 0, isSeeded: false }, 0)
  s = definition2.apply(s, { type: 'request/header', seq: 0, time: 0, data: { header: { config: { provider: 'deepseek-official', model: 'deepseek-flash' } } } })
  s = definition2.apply(s, { type: 'assistant/message', seq: 1, time: at('2026-09-14T02:00:00Z'), data: { turn: 1, step: 1, stream: [], usage: { outputTokens: 1_000_000 } } })
  const before = definition2.wire.view(s).total
  current = normalizeTable({ ...JSON.parse(JSON.stringify(table)), models: { 'deepseek-flash': { label: 'x', input: { peak: 0, offPeak: 0 }, cacheHit: { peak: 0, offPeak: 0 }, output: { peak: 3, offPeak: 3 } } } })
  const after = definition2.wire.view(s).total
  assert.equal(before, 1.2)
  assert.equal(after, 3)
})
check('a table that prices a cache write adds that bucket to the total', () => {
  const withWrite = normalizeTable({
    peak: { weekdaysUtc: [1], windowsUtc: [{ from: 1, to: 2 }] },
    models: { m: { label: 'm', input: { peak: 1, offPeak: 1 }, cacheHit: { peak: 1, offPeak: 1 }, output: { peak: 1, offPeak: 1 }, cacheWrite: { peak: 2, offPeak: 2 } } }
  })
  const definition3 = createDefinition({ get: () => withWrite })
  let s = definition3.init({ version: 3, id: 'x', createdAt: 0, isSeeded: false }, 0)
  s = definition3.apply(s, { type: 'request/header', seq: 0, time: 0, data: { header: { config: { provider: 'p', model: 'm' } } } })
  s = definition3.apply(s, { type: 'assistant/message', seq: 1, time: at('2026-09-14T02:00:00Z'), data: { turn: 1, step: 1, stream: [], usage: { cacheWriteTokens: 1_000_000 } } })
  const v = definition3.wire.view(s)
  assert.equal(v.cost.write, 2)
  assert.equal(v.total, 2)
})

console.log(`\nfailures: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
