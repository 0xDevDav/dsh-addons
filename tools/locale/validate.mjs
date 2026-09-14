// Validate the Italian translation batches against their sources.
import fs from 'node:fs'
import path from 'node:path'

const DIR = import.meta.dirname
const srcFiles = fs.readdirSync(`${DIR}/batches`).filter((f) => f.endsWith('.json')).sort()

const problems = []
const leftovers = []
const all = {}
let totalKeys = 0

for (const file of srcFiles) {
  const srcPath = `${DIR}/batches/${file}`
  const outPath = `${DIR}/it/${file}`
  if (!fs.existsSync(outPath)) { problems.push(`${file}: MISSING OUTPUT`); continue }
  let src, out
  try { src = JSON.parse(fs.readFileSync(srcPath, 'utf8')) } catch (e) { problems.push(`${file}: bad source JSON`); continue }
  try { out = JSON.parse(fs.readFileSync(outPath, 'utf8')) } catch (e) { problems.push(`${file}: INVALID OUTPUT JSON — ${e.message}`); continue }

  if (out.batch !== src.batch) problems.push(`${file}: batch mismatch (${out.batch} vs ${src.batch})`)
  if (out.namespace !== src.namespace) problems.push(`${file}: namespace mismatch`)

  const srcKeys = Object.keys(src.keys)
  const outKeys = Object.keys(out.keys ?? {})
  const missing = srcKeys.filter((k) => !outKeys.includes(k))
  const extra = outKeys.filter((k) => !srcKeys.includes(k))
  if (missing.length) problems.push(`${file}: ${missing.length} MISSING KEYS -> ${missing.slice(0, 5).join(', ')}`)
  if (extra.length) problems.push(`${file}: ${extra.length} EXTRA KEYS -> ${extra.slice(0, 5).join(', ')}`)

  for (const k of srcKeys) {
    const it = out.keys?.[k]
    if (typeof it !== 'string') { problems.push(`${file}: key "${k}" is not a string`); continue }
    if (it.trim() === '') problems.push(`${file}: key "${k}" EMPTY`)
    const en = src.keys[k].en
    totalKeys++
    // Placeholder set must match exactly.
    const tokens = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',')
    if (tokens(en) !== tokens(it)) problems.push(`${file}: key "${k}" PLACEHOLDER mismatch: en[${tokens(en)}] it[${tokens(it)}]`)
    // Leftovers: identical to English and containing real words.
    if (en === it && /[A-Za-z]{3}/.test(en)) leftovers.push({ ns: src.namespace, k, en })
    all[src.namespace] ??= {}
    all[src.namespace][k] = { en, zh: src.keys[k].zh, it }
  }
}

fs.mkdirSync(`${DIR}/review`, { recursive: true })
fs.writeFileSync(`${DIR}/it-merged.json`, JSON.stringify(all, null, 1))

console.log(`batches: ${srcFiles.length}   keys checked: ${totalKeys}`)
console.log(`namespaces merged: ${Object.keys(all).length}`)
console.log(`problems: ${problems.length}`)
for (const p of problems) console.log(`  ! ${p}`)
console.log(`\nidentical-to-English values: ${leftovers.length}`)
const byNs = {}
for (const l of leftovers) (byNs[l.ns] ??= []).push(`${l.k} = "${l.en}"`)
for (const [ns, items] of Object.entries(byNs)) console.log(`  ${ns}: ${items.join(' | ')}`)
