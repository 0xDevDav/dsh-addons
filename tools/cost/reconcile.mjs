import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// Reconcile the per-session cost with the account figure: fold every session log
// on disk through the shipped projection definition and group by UTC day.
import fs from 'node:fs'
import path from 'node:path'
import { readSession } from './session-log.mjs'

const PACK = packPath('dsh-session-cost')
const { normalizeTable } = await import(`file:///${PACK}/lib/pricing.js`)
const { createDefinition } = await import(`file:///${PACK}/lib/index.js`)

const table = normalizeTable(JSON.parse(fs.readFileSync(`${PACK}/prices.json`, 'utf8')))
const definition = createDefinition({ get: () => table })

const ROOT = sessionsRoot()
const logs = []
for (const workspace of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, workspace)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const session of fs.readdirSync(dir)) {
    const file = path.join(dir, session, 'session.v3.jsonl.zstd')
    if (fs.existsSync(file)) logs.push({ workspace, session, file })
  }
}
logs.sort((a, b) => fs.statSync(a.file).mtimeMs - fs.statSync(b.file).mtimeMs)
console.log(`session logs on disk: ${logs.length}\n`)

const rows = []
for (const entry of logs) {
  let events
  try { events = readSession(entry.file) } catch (error) { console.log(`  (unreadable: ${entry.session}: ${error.message})`); continue }
  if (events.length === 0) continue
  const header = events[0].type === 'session' ? events[0] : {}
  let state = definition.init({ version: 3, id: header.id ?? entry.session, createdAt: header.createdAt ?? 0, isSeeded: false }, 0)
  for (const event of events) state = definition.apply(state, event)
  const view = definition.wire.view(state)
  const first = events.find((e) => typeof e.time === 'number')?.time ?? 0
  const last = [...events].reverse().find((e) => typeof e.time === 'number')?.time ?? 0
  rows.push({
    session: entry.session,
    origin: header.origin ?? 'root',
    parent: header.parentSession ?? '',
    requests: view.requests,
    usd: view.total,
    unpriced: view.unpricedRequests,
    day: new Date(first).toISOString().slice(0, 10),
    first: new Date(first).toISOString(),
    last: new Date(last).toISOString(),
    models: view.models.map((m) => `${m.model}:${m.requests}`).join('+')
  })
}

const total = rows.reduce((a, r) => a + r.usd, 0)
const byDay = {}
for (const r of rows) {
  byDay[r.day] ??= { usd: 0, requests: 0, sessions: 0 }
  byDay[r.day].usd += r.usd
  byDay[r.day].requests += r.requests
  byDay[r.day].sessions += 1
}
const roots = rows.filter((r) => r.origin === 'root')
const subagents = rows.filter((r) => r.origin !== 'root')

console.log('per day (UTC):')
for (const [day, agg] of Object.entries(byDay).sort()) {
  console.log(`  ${day}  $${agg.usd.toFixed(4)}  sessions=${agg.sessions}  requests=${agg.requests}`)
}
console.log(`\nroot sessions      : ${roots.length}   $${roots.reduce((a, r) => a + r.usd, 0).toFixed(4)}`)
console.log(`subagent sessions  : ${subagents.length}   $${subagents.reduce((a, r) => a + r.usd, 0).toFixed(4)}`)
console.log(`ALL SESSIONS TOTAL : $${total.toFixed(4)}`)
console.log(`unpriced requests  : ${rows.reduce((a, r) => a + r.unpriced, 0)}`)

console.log('\ntop sessions by cost:')
for (const r of [...rows].sort((a, b) => b.usd - a.usd).slice(0, 12)) {
  console.log(`  $${r.usd.toFixed(4)}  ${r.origin.padEnd(7)} req=${String(r.requests).padStart(4)}  ${r.session.slice(0, 30)}  ${r.first.slice(0, 16)} -> ${r.last.slice(11, 16)}  [${r.models}]`)
}
