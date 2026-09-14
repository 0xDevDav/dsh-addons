import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// Validate the session-tree reader against an independent scan of the same logs.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { readSession } from './session-log.mjs'

const PACK = packPath('dsh-session-cost')
const { normalizeTable, buildView } = await import(`file:///${PACK}/lib/pricing.js`)
const { createDefinition, resolveHarnessHome } = await import(`file:///${PACK}/lib/index.js`)
const { createTreeReader, decodeSessionLog, listSessionLogs, LOG_FILENAME } = await import(`file:///${PACK}/lib/tree.js`)

const table = normalizeTable(JSON.parse(fs.readFileSync(`${PACK}/prices.json`, 'utf8')))
const definition = createDefinition({ get: () => table })
const fold = (events, header) => {
  let state = definition.init(header ?? { version: 3, id: 'unknown', createdAt: 0, isSeeded: false }, 0)
  for (const event of events) state = definition.apply(state, event)
  return definition.wire.view(state)
}

const SESSIONS_ROOT = sessionsRoot()
const ROOT_ID = process.argv[2] ?? rootSessionId()

let failures = 0
const check = (label, fn) => {
  try { fn(); console.log(`  ok   ${label}`) } catch (error) { failures++; console.log(`  FAIL ${label}: ${error.message}`) }
}

// ── the log decoder ─────────────────────────────────────────────────────────
console.log('durable log reader:')
const logs = listSessionLogs(SESSIONS_ROOT)
check('every session log on disk is discovered', () => assert.ok(logs.length >= 50, `found ${logs.length}`))
check('the discovered files are the versioned session logs', () => {
  for (const file of logs) assert.ok(file.endsWith(LOG_FILENAME), file)
})
check('the home default follows DSH_HOME', () => assert.equal(resolveHarnessHome(), process.env.DSH_HOME))

const sample = logs.reduce((best, file) => (fs.statSync(file).size > fs.statSync(best).size ? file : best), logs[0])
const decoded = decodeSessionLog(fs.readFileSync(sample))
const independently = readSession(sample)
check('the multi-frame decoder agrees with an independent decoder', () => {
  assert.equal(decoded.length, independently.length)
  assert.deepEqual(decoded[0], independently[0])
  assert.deepEqual(decoded[decoded.length - 1], independently[independently.length - 1])
})
check('the header probe decodes the first frame without the whole file', () => {
  const probe = fs.readFileSync(sample, { length: Math.min(fs.statSync(sample).size, 8192) })
  const first = decodeSessionLog(probe)[0]
  assert.equal(first?.type, 'session')
  assert.equal(first.id, independently[0].id)
})

// ── independent expectation ─────────────────────────────────────────────────
const family = new Map()
for (const file of logs) {
  const events = readSession(file)
  if (events.length === 0) continue
  const header = events[0].type === 'session' ? events[0] : {}
  family.set(header.id, { parent: header.parentSession ?? null, view: fold(events, header) })
}
const expectedTree = (rootId) => {
  const members = [rootId]
  for (let index = 0; index < members.length; index++) {
    for (const [id, node] of family) if (node.parent === members[index] && !members.includes(id)) members.push(id)
  }
  const cost = { miss: 0, hit: 0, write: 0, out: 0 }
  let total = 0
  let requests = 0
  for (const id of members) {
    const node = family.get(id)
    if (node === undefined) continue
    total += node.view.total
    requests += node.view.requests
    for (const bucket of Object.keys(cost)) cost[bucket] += node.view.cost[bucket]
  }
  return { members, total, requests, cost }
}

// ── the tree reader ─────────────────────────────────────────────────────────
console.log('\ntree reader:')
const reader = createTreeReader({ sessionsRoot: SESSIONS_ROOT, fold, liveCost: () => undefined })
const expected = expectedTree(ROOT_ID)
const actual = reader.subtree(ROOT_ID)
console.log(`  root ${ROOT_ID}`)
console.log(`  sessions        ${actual.sessions} (expected ${expected.members.length})`)
console.log(`  requests        ${actual.requests} (expected ${expected.requests})`)
console.log(`  total           $${actual.total.toFixed(6)} (expected $${expected.total.toFixed(6)})`)
console.log(`  buckets         miss $${actual.cost.miss.toFixed(6)}  hit $${actual.cost.hit.toFixed(6)}  out $${actual.cost.out.toFixed(6)}`)

check('the tree covers the root and every descendant', () => assert.equal(actual.sessions, expected.members.length))
check('the tree request count matches the independent scan', () => assert.equal(actual.requests, expected.requests))
check('the tree total matches the independent scan', () => assert.ok(Math.abs(actual.total - expected.total) < 1e-9, `${actual.total} vs ${expected.total}`))
check('every bucket matches the independent scan', () => {
  for (const bucket of ['miss', 'hit', 'write', 'out']) {
    assert.ok(Math.abs(actual.cost[bucket] - expected.cost[bucket]) < 1e-9, `${bucket}: ${actual.cost[bucket]} vs ${expected.cost[bucket]}`)
  }
})
check('the total is the sum of the buckets', () => {
  const sum = actual.cost.miss + actual.cost.hit + actual.cost.write + actual.cost.out
  assert.ok(Math.abs(actual.total - sum) < 1e-9)
})
check('the tree is complete and priced', () => {
  assert.equal(actual.complete, true)
  assert.equal(actual.unpricedRequests, 0)
  assert.equal(actual.unreadable, 0)
})
check('a repeat read answers from cache with the same figure', () => {
  assert.deepEqual(reader.subtree(ROOT_ID), actual)
})

const childId = expected.members.find((id) => id !== ROOT_ID)
check('a subagent session totals only its own subtree', () => {
  const child = reader.subtree(childId)
  const childExpected = expectedTree(childId)
  assert.equal(child.sessions, childExpected.members.length)
  assert.ok(Math.abs(child.total - childExpected.total) < 1e-9)
  assert.ok(child.total < actual.total, 'a child costs less than its whole tree')
})

check('an unknown session yields an empty, explicitly incomplete figure', () => {
  const missing = reader.subtree('no-such-session')
  assert.equal(missing.total, 0)
  assert.equal(missing.sessions, 1)
  assert.equal(missing.unreadable, 1)
  assert.equal(missing.complete, false)
})

check('a live session’s registry value wins over its log', () => {
  const live = { total: 12.5, cost: { miss: 1, hit: 2, write: 0, out: 9.5 }, requests: 3, pricedRequests: 3, unpricedRequests: 0, complete: true }
  const liveReader = createTreeReader({ sessionsRoot: SESSIONS_ROOT, fold, liveCost: (id) => (id === ROOT_ID ? live : undefined) })
  const value = liveReader.subtree(ROOT_ID)
  assert.equal(value.sessions, expected.members.length)
  assert.ok(Math.abs(value.total - (expected.total - family.get(ROOT_ID).view.total + 12.5)) < 1e-9)
})

check('a reader pointed at a missing root directory degrades quietly', () => {
  const empty = createTreeReader({ sessionsRoot: (sessionsRoot() + '-nope'), fold, liveCost: () => undefined })
  const value = empty.subtree(ROOT_ID)
  assert.equal(value.total, 0)
  assert.equal(value.complete, false)
})

check('a decode failure is reported, never invented', () => {
  const value = createTreeReader({ sessionsRoot: SESSIONS_ROOT, fold: () => { throw new Error('fold refused') }, liveCost: () => undefined }).subtree(ROOT_ID)
  assert.equal(value.total, 0)
  assert.equal(value.unreadable > 0, true)
  assert.equal(value.complete, false)
})

// ── torn writes ─────────────────────────────────────────────────────────────
console.log('\ntorn writes:')
const full = fs.readFileSync(sample)
check('a truncated tail loses only the unterminated frame', () => {
  const torn = full.subarray(0, Math.max(1, full.length - 20))
  const events = decodeSessionLog(torn)
  assert.ok(events.length >= 1, 'the intact prefix still decodes')
  assert.equal(events[0].type, 'session')
})
check('an empty buffer decodes to nothing instead of throwing', () => assert.deepEqual(decodeSessionLog(Buffer.alloc(0)), []))

console.log(`\nfailures: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
