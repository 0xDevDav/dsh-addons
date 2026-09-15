// Compare the locale key sets of two dictionary extractions, optionally against
// the keys a language pack already covers. Answers the practical question after a
// DSH update: which strings would a pack leave in English?
//
//   node coverage-diff.mjs <baseline dicts.json> <target dicts.json> [pack it-dictionaries.json]
import fs from 'node:fs'

const [baselineFile, targetFile, packFile] = process.argv.slice(2)
if (!baselineFile || !targetFile) {
  console.error('usage: node coverage-diff.mjs <baseline dicts.json> <target dicts.json> [pack it-dictionaries.json]')
  process.exit(2)
}

/** The English key set per namespace, merged across every owning package. */
function keysOf(file) {
  const dicts = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = new Map()
  for (const [ns, owners] of Object.entries(dicts)) {
    const keys = new Set()
    for (const locales of Object.values(owners)) {
      for (const key of Object.keys(locales.en?.value ?? {})) keys.add(key)
    }
    out.set(ns, keys)
  }
  return out
}

/** The English text per namespace, merged across every owning package. */
function textsOf(file) {
  const dicts = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = new Map()
  for (const [ns, owners] of Object.entries(dicts)) {
    const texts = new Map()
    for (const locales of Object.values(owners)) {
      for (const [key, value] of Object.entries(locales.en?.value ?? {})) {
        if (typeof value === 'string' && !texts.has(key)) texts.set(key, value)
      }
    }
    out.set(ns, texts)
  }
  return out
}

/** The key set per namespace of a finished pack dictionary (`{ns: {key: value}}`). */
function keysOfPack(file) {
  const dicts = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = new Map()
  for (const [ns, entries] of Object.entries(dicts)) out.set(ns, new Set(Object.keys(entries)))
  return out
}

const baseline = keysOf(baselineFile)
const target = keysOf(targetFile)
const pack = packFile ? keysOfPack(packFile) : undefined

/** A Set has `size`, an array has `length`: both mean "how many keys here". */
const sizeOf = (value) => value.size ?? value.length
const sumKeys = (map, names = [...map.keys()]) => names.reduce((total, ns) => total + sizeOf(map.get(ns)), 0)
const name = (file) => file.split(/[\\/]/).pop()

const addedNamespaces = [...target.keys()].filter((ns) => !baseline.has(ns)).sort()
const droppedNamespaces = [...baseline.keys()].filter((ns) => !target.has(ns)).sort()
const shared = [...target.keys()].filter((ns) => baseline.has(ns)).sort()

const added = new Map()
const removed = new Map()
for (const ns of shared) {
  const gain = [...target.get(ns)].filter((key) => !baseline.get(ns).has(key))
  const loss = [...baseline.get(ns)].filter((key) => !target.get(ns).has(key))
  if (gain.length) added.set(ns, gain.sort())
  if (loss.length) removed.set(ns, loss.sort())
}

const totalBaseline = sumKeys(baseline)
const totalTarget = sumKeys(target)
const addedInShared = sumKeys(added)
const addedInNew = sumKeys(target, addedNamespaces)
const totalAdded = addedInShared + addedInNew
const totalRemoved = sumKeys(removed) + sumKeys(baseline, droppedNamespaces)

console.log(`${name(baselineFile)}: ${baseline.size} namespaces, ${totalBaseline} English keys`)
console.log(`${name(targetFile)}:   ${target.size} namespaces, ${totalTarget} English keys`)
console.log('')
console.log(`namespaces: +${addedNamespaces.length} new, -${droppedNamespaces.length} gone, ${shared.length} shared`)
for (const ns of addedNamespaces) console.log(`  new      ${ns.padEnd(34)} ${target.get(ns).size} keys`)
for (const ns of droppedNamespaces) console.log(`  gone     ${ns.padEnd(34)} ${baseline.get(ns).size} keys`)
console.log('')

if (added.size === 0 && addedNamespaces.length === 0) {
  console.log('no new keys: the pack keeps full coverage')
} else {
  console.log(`NEW KEYS: ${totalAdded}  (${addedInShared} inside existing namespaces, ${addedInNew} in new namespaces)`)
  const ranked = [...added.entries()].sort((a, b) => b[1].length - a[1].length)
  for (const [ns, keys] of ranked.slice(0, 20)) console.log(`  ${String(keys.length).padStart(4)}  ${ns}`)
  if (ranked.length > 20) console.log(`  ... and ${ranked.length - 20} more namespaces`)
}
if (totalRemoved) {
  console.log('')
  console.log(`REMOVED KEYS: ${totalRemoved}`)
  for (const [ns, keys] of [...removed.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(keys.length).padStart(4)}  ${ns}   e.g. ${keys.slice(0, 3).join(', ')}`)
  }
  for (const ns of droppedNamespaces) console.log(`  ${String(baseline.get(ns).size).padStart(4)}  ${ns} (namespace gone)`)
}

// A key that survived with different English text keeps its translation, which may
// now say the wrong thing: the existing pack needs a re-read, not just additions.
const baselineTexts = textsOf(baselineFile)
const targetTexts = textsOf(targetFile)
const reworded = []
for (const ns of shared) {
  const before = baselineTexts.get(ns) ?? new Map()
  const after = targetTexts.get(ns) ?? new Map()
  for (const [key, value] of after) {
    if (before.has(key) && before.get(key) !== value) reworded.push([ns, key, before.get(key), value])
  }
}
console.log('')
console.log(`REWORDED ENGLISH (translation may be stale): ${reworded.length}`)
for (const [ns, key, before, after] of reworded.slice(0, 15)) {
  console.log(`  ${ns}.${key}`)
  console.log(`      was: ${JSON.stringify(before)}`)
  console.log(`      now: ${JSON.stringify(after)}`)
}
if (reworded.length > 15) console.log(`  ... and ${reworded.length - 15} more`)

if (pack) {
  const packed = sumKeys(pack)
  const coveredBaseline = [...baseline.keys()].filter((ns) => pack.has(ns)).length
  let missingFromTarget = 0
  for (const [ns, keys] of target) {
    const have = pack.get(ns)
    if (!have) { missingFromTarget += keys.size; continue }
    for (const key of keys) if (!have.has(key)) missingFromTarget++
  }
  console.log('')
  console.log(`PACK ${name(packFile)}: ${pack.size} namespaces, ${packed} keys`)
  console.log(`  covers ${coveredBaseline}/${baseline.size} of the baseline namespaces`)
  console.log(`  after the update, ${missingFromTarget} of ${totalTarget} keys would fall back to English`)
  console.log(`  coverage: ${(100 * (1 - missingFromTarget / totalTarget)).toFixed(1)}%`)
  const perNamespace = []
  for (const [ns, keys] of target) {
    const have = pack.get(ns)
    const missing = have ? [...keys].filter((key) => !have.has(key)).length : keys.size
    if (missing) perNamespace.push([ns, missing, keys.size])
  }
  perNamespace.sort((a, b) => b[1] - a[1])
  for (const [ns, missing, total] of perNamespace.slice(0, 15)) {
    console.log(`    ${String(missing).padStart(4)}/${String(total).padEnd(4)} missing  ${ns}`)
  }
  if (perNamespace.length > 15) console.log(`    ... and ${perNamespace.length - 15} more namespaces`)
}
