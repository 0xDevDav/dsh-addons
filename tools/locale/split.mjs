// Split the extracted dictionaries into translation batches.
import fs from 'node:fs'
import path from 'node:path'

const SRC = (import.meta.dirname + '/dicts.json')
const DIR = (import.meta.dirname + '/batches')
const MAX = 70

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'))

// Merge every owner package into one en/zh pair per namespace.
const ns = {}
const conflicts = []
for (const [namespace, owners] of Object.entries(data)) {
  const en = {}
  const zh = {}
  for (const [pkg, dicts] of Object.entries(owners)) {
    for (const [k, v] of Object.entries(dicts.en?.value ?? {})) {
      if (k in en && en[k] !== v) conflicts.push({ namespace, pkg, k, a: en[k], b: v })
      en[k] = v
    }
    for (const [k, v] of Object.entries(dicts.zh?.value ?? {})) zh[k] = v
  }
  ns[namespace] = { en, zh }
}

fs.rmSync(DIR, { recursive: true, force: true })
fs.mkdirSync(DIR, { recursive: true })

const batches = []
let n = 0
for (const [namespace, { en, zh }] of Object.entries(ns)) {
  const keys = Object.keys(en)
  if (!keys.length) continue
  for (let i = 0; i < keys.length; i += MAX) {
    const slice = keys.slice(i, i + MAX)
    const id = `${namespace}${keys.length > MAX ? `#${Math.floor(i / MAX) + 1}` : ''}`
    const file = `batch-${String(++n).padStart(2, '0')}.json`
    const payload = {}
    for (const k of slice) payload[k] = { en: en[k], zh: zh[k] ?? null }
    fs.writeFileSync(
      path.join(DIR, file),
      JSON.stringify({ batch: id, namespace, total: slice.length, keys: payload }, null, 1),
    )
    batches.push({ id, namespace, file, keys: slice.length })
  }
}

fs.writeFileSync(
  (import.meta.dirname + '/batches.json'),
  JSON.stringify({ batches, namespaces: Object.keys(ns).length, totalKeys: batches.reduce((a, b) => a + b.keys, 0) }, null, 1),
)

console.log(`namespaces: ${Object.keys(ns).length}`)
console.log(`batches: ${batches.length}  total keys: ${batches.reduce((a, b) => a + b.keys, 0)}`)
console.log(`conflicts: ${conflicts.length}`)
for (const c of conflicts) console.log(`  ${c.namespace} ${c.k} : "${c.a}" vs "${c.b}"`)
console.log('')
for (const b of batches) console.log(`${b.file}  ${String(b.keys).padStart(3)}  ${b.id}`)
