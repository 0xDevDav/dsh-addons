// Plan a dictionary update: compare the key sets of two extractions and write the
// list of work a translator has to do.
//
//   node plan-update.mjs <baseline dicts.json> <target dicts.json> <out.json>
//
// The output has two parts:
//   added    - keys the new release introduces, with their English and Chinese text
//   reworded - keys whose English text changed, with the old text and the Italian
//              currently shipped, because that translation may now say the wrong thing
// Removed keys need no work: they simply stop being part of the batches.
import fs from 'node:fs'
import path from 'node:path'

const [baselineFile, targetFile, outFile] = process.argv.slice(2)
if (!baselineFile || !targetFile || !outFile) {
  console.error('usage: node plan-update.mjs <baseline dicts.json> <target dicts.json> <out.json>')
  process.exit(2)
}

/** The English text and Chinese reference per namespace, merged across owners. */
function textsOf(file) {
  const dicts = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = new Map()
  for (const [ns, owners] of Object.entries(dicts)) {
    const en = new Map()
    const zh = new Map()
    for (const locales of Object.values(owners)) {
      for (const [key, value] of Object.entries(locales.en?.value ?? {})) if (!en.has(key)) en.set(key, value)
      for (const [key, value] of Object.entries(locales.zh?.value ?? {})) if (!zh.has(key)) zh.set(key, value)
    }
    out.set(ns, { en, zh })
  }
  return out
}

const baseline = textsOf(baselineFile)
const target = textsOf(targetFile)
const shipped = fs.existsSync(`${import.meta.dirname}/it-dictionaries.json`)
  ? JSON.parse(fs.readFileSync(`${import.meta.dirname}/it-dictionaries.json`, 'utf8'))
  : {}

const added = {}
const reworded = {}
let addedCount = 0
let rewordedCount = 0

for (const [ns, { en, zh }] of target) {
  const before = baseline.get(ns) ?? { en: new Map(), zh: new Map() }
  for (const [key, value] of en) {
    if (!before.en.has(key)) {
      ;(added[ns] ??= {})[key] = { en: value, zh: zh.get(key) ?? null }
      addedCount++
      continue
    }
    const previous = before.en.get(key)
    if (previous !== value) {
      ;(reworded[ns] ??= {})[key] = { en: value, wasEn: previous, currentIt: shipped[ns]?.[key] ?? null }
      rewordedCount++
    }
  }
}

const removed = []
for (const [ns, { en }] of baseline) {
  const now = target.get(ns)?.en ?? new Map()
  for (const key of en.keys()) if (!now.has(key)) removed.push(`${ns}.${key}`)
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify({ added, reworded, removed }, null, 1))

console.log(`${outFile.split(/[\\/]/).pop()}: ${addedCount} keys to translate, ${rewordedCount} translations to review, ${removed.length} keys gone`)
console.log('')
console.log(`NEW KEYS (${addedCount})`)
for (const [ns, keys] of Object.entries(added)) {
  console.log(`  namespace ${JSON.stringify(ns)}  (${Object.keys(keys).length} keys)`)
  for (const [key, value] of Object.entries(keys)) {
    console.log(`     key ${JSON.stringify(key)}`)
    console.log(`        en: ${JSON.stringify(value.en)}`)
    if (value.zh) console.log(`        zh: ${JSON.stringify(value.zh)}`)
  }
}
console.log('')
console.log(`REWORDED (${rewordedCount})`)
for (const [ns, keys] of Object.entries(reworded)) {
  for (const [key, value] of Object.entries(keys)) {
    console.log(`  namespace ${JSON.stringify(ns)}`)
    console.log(`  key       ${JSON.stringify(key)}`)
    console.log(`        era: ${JSON.stringify(value.wasEn)}`)
    console.log(`        ora: ${JSON.stringify(value.en)}`)
    console.log(`        it:  ${JSON.stringify(value.currentIt)}`)
  }
}
if (removed.length) {
  console.log('')
  console.log(`REMOVED (${removed.length}) - no work, they leave the batches`)
  for (const item of removed) console.log('  ' + item)
}
