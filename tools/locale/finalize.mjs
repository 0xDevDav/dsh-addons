// Final consistency fixes + full re-validation of the merged Italian dictionary.
import fs from 'node:fs'

const DIR = import.meta.dirname
const merged = JSON.parse(fs.readFileSync(`${DIR}/it-merged.json`, 'utf8'))
const src = JSON.parse(fs.readFileSync(`${DIR}/dicts.json`, 'utf8'))

const FIXES = {
  model: {
    'trigger.ariaEffort': 'Seleziona modello, attuale {model}, livello di ragionamento {effort}',
    'menu.aria': 'Modello e livello di ragionamento',
    'menu.effort': 'Livello di ragionamento',
    'empty.efforts': 'Questo modello non offre livelli di ragionamento.',
  },
  'settings.plugins': {
    subagentModelSelectionChoose:
      'Se attivo, gli agenti possono scegliere un provider, un modello e un livello di ragionamento per ogni subagente tra i modelli autorizzati riportati sotto. Si applica solo alle nuove sessioni.',
  },
  trajectory: { 'source.goalRound': 'Obiettivo · Ciclo {round}' },
}

let applied = 0
for (const [ns, fixes] of Object.entries(FIXES)) {
  for (const [k, v] of Object.entries(fixes)) {
    if (!merged[ns]?.[k]) { console.log(`MISSING ${ns}.${k}`); continue }
    merged[ns][k].it = v
    applied++
  }
}
console.log(`final fixes applied: ${applied}`)

// ── full validation ──────────────────────────────────────────────────────────
const tokens = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',')
let keys = 0
const problems = []

// Expected namespace -> key set from the extracted sources.
const expected = {}
for (const [ns, owners] of Object.entries(src)) {
  const set = new Set()
  for (const dicts of Object.values(owners)) for (const k of Object.keys(dicts.en?.value ?? {})) set.add(k)
  if (set.size) expected[ns] = set
}

for (const [ns, set] of Object.entries(expected)) {
  const got = merged[ns]
  if (!got) { problems.push(`namespace ${ns} MISSING from translation`); continue }
  for (const k of set) {
    const e = got[k]
    if (!e) { problems.push(`${ns}.${k} MISSING`); continue }
    keys++
    if (typeof e.it !== 'string' || e.it.trim() === '') problems.push(`${ns}.${k} empty`)
    if (tokens(e.en) !== tokens(e.it)) problems.push(`${ns}.${k} placeholder mismatch [${tokens(e.en)}] vs [${tokens(e.it)}]`)
  }
  const extra = Object.keys(got).filter((k) => !set.has(k))
  if (extra.length) problems.push(`namespace ${ns} has ${extra.length} unknown keys: ${extra.slice(0, 4).join(', ')}`)
}

console.log(`namespaces: ${Object.keys(expected).length}   keys validated: ${keys}`)
console.log(`problems: ${problems.length}`)
for (const p of problems) console.log(`  ! ${p}`)

fs.writeFileSync(`${DIR}/it-merged.json`, JSON.stringify(merged, null, 1))

// Emit the final dictionary in the shape the language pack consumes.
const dict = {}
for (const [ns, entries] of Object.entries(merged)) {
  dict[ns] = {}
  for (const [k, v] of Object.entries(entries)) dict[ns][k] = v.it
}
fs.writeFileSync(`${DIR}/it-dictionaries.json`, JSON.stringify(dict, null, 1))
const size = fs.statSync(`${DIR}/it-dictionaries.json`).size
console.log(`\nit-dictionaries.json written: ${Object.keys(dict).length} namespaces, ${keys} keys, ${(size / 1024).toFixed(1)} KiB`)
