// Content check of the shipped Italian pack: does the bundle the profile serves carry every
// key of the release it was built for, with exactly the values this repository holds?
//
//   node tools/locale/verify-locale-update.mjs [path/to/dsh-locale-it/lib/client.js]
//
// With no argument it checks the installed pack, found through `$DSH_HOME`. Three things are
// proved, in order of strength:
//
//   1. the bundle registers the `it` language and every namespace of the extraction
//   2. every key of that extraction is present, with the value `it-dictionaries.json` carries
//      — so the copy on this machine and the repository cannot drift apart unnoticed
//   3. nothing else is registered: a key the release dropped would otherwise ship forever
//
// The English extraction (`dicts.json`) is what "the release" means here, so the same command
// verifies any release: re-extract, rebuild, re-check.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { packPath } from '../paths.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DICT = process.argv[2] ?? path.join(packPath('dsh-locale-it'), 'lib', 'client.js')
const SOURCE = path.join(HERE, 'it-dictionaries.json')
const EXTRACTION = path.join(HERE, 'dicts.json')

const italian = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
const extraction = JSON.parse(fs.readFileSync(EXTRACTION, 'utf8'))

let captured
globalThis.window = { __ModuleLoader__: { load(definition) { captured = definition } } }
await import(pathToFileURL(DICT).href)
const registered = captured.factory()

const languages = []
const dictionaries = {}
registered.apply({
  locale: {
    addLanguage(language) { languages.push(language); return () => {} },
    register(ns, id, value) { dictionaries[ns] = value; return () => {} },
  },
  effect(fn) { fn() },
})

/** The English key set per namespace, merged across the packages that own it. */
const keysOf = (ns) => {
  const keys = new Set()
  for (const locales of Object.values(extraction[ns] ?? {})) {
    for (const key of Object.keys(locales.en?.value ?? {})) keys.add(key)
  }
  return keys
}

const failures = []
const flat = (ns, key) => `${ns}.${key}`

// 1. the language itself
const language = languages[0]
if (language?.id !== 'it') failures.push(`lingua registrata: ${JSON.stringify(language)} (atteso id "it")`)
if (language?.fallback !== 'en') failures.push(`fallback della lingua: ${JSON.stringify(language?.fallback)} (atteso "en")`)

// 2. every key of the release, with the value the repository holds
let expectedKeys = 0
let missingKeys = 0
let differingValues = 0
const missingNamespaces = []
for (const ns of Object.keys(extraction)) {
  if (dictionaries[ns] === undefined) {
    missingNamespaces.push(ns)
    continue
  }
  for (const key of keysOf(ns)) {
    expectedKeys++
    const wanted = italian[ns]?.[key]
    const actual = dictionaries[ns]?.[key]
    if (typeof wanted !== 'string') {
      missingKeys++
      failures.push(`nessuna traduzione nel repository per ${flat(ns, key)}`)
      continue
    }
    if (actual === undefined) {
      missingKeys++
      failures.push(`chiave assente dal pacchetto: ${flat(ns, key)}`)
      continue
    }
    if (actual !== wanted) {
      differingValues++
      failures.push(`valore diverso da it-dictionaries.json: ${flat(ns, key)}`)
    }
  }
}

// 3. nothing extra: registered keys the release no longer has
let extraKeys = 0
for (const [ns, entries] of Object.entries(dictionaries)) {
  const known = extraction[ns] === undefined ? new Set() : keysOf(ns)
  for (const key of Object.keys(entries)) {
    if (!known.has(key)) {
      extraKeys++
      failures.push(`chiave che la release non ha più: ${flat(ns, key)}`)
    }
  }
}

const registeredKeys = Object.values(dictionaries).reduce((total, entries) => total + Object.keys(entries).length, 0)

console.log(`bundle        ${DICT}`)
console.log(`release keys  ${expectedKeys} in ${Object.keys(extraction).length} namespaces`)
console.log(`bundle keys   ${registeredKeys} in ${Object.keys(dictionaries).length} namespaces`)
console.log(`language      ${JSON.stringify(language)}`)
console.log('')
console.log(`namespace mancanti:            ${missingNamespaces.length}${missingNamespaces.length ? ' -> ' + missingNamespaces.join(', ') : ''}`)
console.log(`chiavi mancanti:               ${missingKeys}`)
console.log(`valori divergenti dal repo:    ${differingValues}`)
console.log(`chiavi non più nella release:  ${extraKeys}`)
console.log('')
console.log(failures.length === 0 ? 'VERIFICA SUPERATA' : `VERIFICA FALLITA (${failures.length})`)
for (const failure of failures.slice(0, 40)) console.log('  ! ' + failure)
if (failures.length > 40) console.log(`  … e altre ${failures.length - 40}`)
process.exit(failures.length === 0 ? 0 : 1)
