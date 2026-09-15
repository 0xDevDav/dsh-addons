import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// Cost of one session tree: the root session plus every descendant session.
import fs from 'node:fs'
import path from 'node:path'
import { readSession } from './session-log.mjs'

const PACK = packPath('dsh-session-cost')
const { normalizeTable, priceOf } = await import(`file:///${PACK}/lib/pricing.js`)
const { createDefinition } = await import(`file:///${PACK}/lib/index.js`)

const table = normalizeTable(JSON.parse(fs.readFileSync(`${PACK}/prices.json`, 'utf8')))
const definition = createDefinition({ get: () => table })
const ROOT = process.argv[2] ?? sessionsRoot()

/** Requests per billed model in one folded state, whichever tier they fell in. */
const modelRequests = (state) => {
  const found = new Map()
  for (const [model, record] of Object.entries(state.buckets ?? {})) {
    found.set(model, record.peak.requests + record.offPeak.requests)
  }
  return found
}

const nodes = []
for (const workspace of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, workspace)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const session of fs.readdirSync(dir)) {
    const file = path.join(dir, session, 'session.v3.jsonl.zstd')
    if (!fs.existsSync(file)) continue
    const events = readSession(file)
    if (events.length === 0) continue
    const header = events[0].type === 'session' ? events[0] : {}
    let state = definition.init({ version: 3, id: header.id ?? session, createdAt: header.createdAt ?? 0, isSeeded: false }, 0)
    for (const event of events) state = definition.apply(state, event)
    const view = definition.wire.view(state)
    nodes.push({
      id: header.id ?? session,
      parent: header.parentSession ?? null,
      origin: header.origin ?? 'root',
      preset: header.agentPreset ?? '',
      requests: view.requests,
      total: view.total,
      cost: view.cost,
      unpriced: view.unpricedRequests,
      models: modelRequests(state),
      first: events.find((e) => typeof e.time === 'number')?.time ?? 0
    })
  }
}

const byId = new Map(nodes.map((node) => [node.id, node]))
const children = new Map()
for (const node of nodes) {
  if (node.parent === null || !byId.has(node.parent)) continue
  const list = children.get(node.parent) ?? []
  list.push(node)
  children.set(node.parent, list)
}

const roots = nodes.filter((node) => node.parent === null || !byId.has(node.parent))
console.log(`sessions on disk: ${nodes.length}   roots: ${roots.length}\n`)

const rollup = (node, depth = 0, out = { sessions: 0, requests: 0, total: 0, unpriced: 0, models: new Map(), cost: { miss: 0, hit: 0, write: 0, out: 0 } }) => {
  out.sessions += 1
  out.requests += node.requests
  out.total += node.total
  out.unpriced += node.unpriced
  for (const [model, requests] of node.models) out.models.set(model, (out.models.get(model) ?? 0) + requests)
  for (const key of Object.keys(out.cost)) out.cost[key] += node.cost[key]
  for (const child of children.get(node.id) ?? []) rollup(child, depth + 1, out)
  return out
}

/**
 * Every model the tree billed, and whether the price table knows it. This is the line that
 * answers "why does the pill say *at least*": a model the table does not price contributes
 * nothing to the total rather than being guessed at another model's rate.
 */
const reportModels = (models) => {
  console.log('  --- models ---')
  for (const [model, requests] of [...models].sort((a, b) => b[1] - a[1])) {
    const entry = priceOf(table, model)
    console.log(`  ${pad(model, 30)} ${pad(requests, 6)} ${entry === undefined ? 'SENZA PREZZO — non conta nel totale' : entry.label}`)
  }
}

const pad = (value, width) => String(value).padEnd(width)
console.log(`${pad('SESSION', 40)} ${pad('ORIGIN', 8)} ${pad('PRESET', 10)} ${pad('REQ', 5)} ${'COST'}`)
for (const root of roots) {
  const tree = rollup(root)
  const unknown = tree.unpriced > 0 ? `   ${tree.unpriced} richieste senza prezzo` : ''
  console.log(`${pad(root.id, 40)} ${pad(root.origin, 8)} ${pad(root.preset, 10)} ${pad(tree.requests, 5)} $${tree.total.toFixed(4)}   (${tree.sessions} sessioni${tree.sessions > 1 ? `, ${tree.sessions - 1} subagenti` : ''})${unknown}`)
}

const target = process.argv[3]
if (target !== undefined) {
  const root = byId.get(target) ?? roots.find((node) => node.id.includes(target))
  if (root === undefined) {
    console.log(`\nroot not found: ${target}`)
  } else {
    const tree = rollup(root)
    const descendants = { sessions: 0, requests: 0, total: 0, cost: { miss: 0, hit: 0, write: 0, out: 0 } }
    for (const child of children.get(root.id) ?? []) rollup(child, 1, descendants)
    console.log(`\n=== tree of ${root.id} ===`)
    console.log(`  sessions        ${tree.sessions} (1 root + ${tree.sessions - 1} descendants)`)
    console.log(`  requests        ${tree.requests}`)
    console.log(`  input miss      $${tree.cost.miss.toFixed(6)}`)
    console.log(`  input hit       $${tree.cost.hit.toFixed(6)}`)
    console.log(`  output          $${tree.cost.out.toFixed(6)}`)
    console.log(`  cache write     $${tree.cost.write.toFixed(6)}`)
    console.log(`  TOTAL           $${tree.total.toFixed(6)}`)
    console.log(`  --- of which ---`)
    console.log(`  this session    $${root.total.toFixed(6)}   (${root.requests} requests)`)
    console.log(`  ${descendants.sessions} subagents    $${descendants.total.toFixed(6)}   (${descendants.requests} requests)`)
    console.log(`  direct children ${(children.get(root.id) ?? []).length}`)
    console.log('')
    reportModels(tree.models)
    const unpriced = tree.unpriced
    console.log('')
    console.log(unpriced === 0
      ? `  ogni richiesta ha un prezzo pubblicato: il totale è esatto.`
      : `  ${unpriced} richieste senza prezzo: il totale è un MINIMO (nel pannello il costo è "almeno" questo).`)
  }
}
