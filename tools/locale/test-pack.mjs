import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// Functional test of the generated browser half: simulate __ModuleLoader__ and the
// locale service, then assert exactly what the pack contributes.
const PACK = packPath('dsh-locale-it')
const expected = JSON.parse(
  await import('node:fs').then((fs) => fs.readFileSync((import.meta.dirname + '/it-dictionaries.json'), 'utf8')),
)

let captured
globalThis.window = {
  __ModuleLoader__: {
    load(def) { captured = def },
  },
}

await import(`file:///${PACK}/lib/client.js`)

const failures = []
const check = (cond, msg) => { if (!cond) failures.push(msg) }

check(captured !== undefined, 'bundle did not call window.__ModuleLoader__.load')
check(captured?.id === 'dsh-locale-it', `bundle id is "${captured?.id}"`)

const mod = captured.factory()
check(Array.isArray(mod.inject) && mod.inject.includes('locale'), 'exports.inject must request the locale service')
check(typeof mod.apply === 'function', 'exports.apply must be a function')

// ── happy path ───────────────────────────────────────────────────────────────
const languages = []
const dicts = {}
const effects = []
const ctx = {
  locale: {
    addLanguage(l) { languages.push(l); return () => { languages.pop() } },
    register(ns, id, dict) { dicts[ns] = { id, dict }; return () => { delete dicts[ns] } },
  },
  effect(fn, label) { effects.push({ label, dispose: fn() }) },
}

mod.apply(ctx)

check(languages.length === 1, `addLanguage called ${languages.length} times`)
check(languages[0]?.id === 'it', `language id is "${languages[0]?.id}"`)
check(languages[0]?.label === 'Italiano', `language label is "${languages[0]?.label}"`)
check(languages[0]?.fallback === 'en', `language fallback is "${languages[0]?.fallback}"`)

const expectedNs = Object.keys(expected)
check(Object.keys(dicts).length === expectedNs.length, `registered ${Object.keys(dicts).length} namespaces, expected ${expectedNs.length}`)

let totalKeys = 0
let mismatched = 0
for (const [ns, src] of Object.entries(expected)) {
  const got = dicts[ns]
  if (!got) { failures.push(`namespace ${ns} not registered`); continue }
  if (got.id !== 'it') failures.push(`namespace ${ns} registered under "${got.id}"`)
  const a = Object.keys(src).sort().join('\u0000')
  const b = Object.keys(got.dict).sort().join('\u0000')
  if (a !== b) mismatched++
  totalKeys += Object.keys(got.dict).length
}
check(mismatched === 0, `${mismatched} namespaces have a different key set than the source`)
check(totalKeys === 1257, `registered ${totalKeys} keys, expected 1257`)
check(effects.length === expectedNs.length + 1, `${effects.length} effects for ${expectedNs.length} namespaces + language`)

// ── disposers must be functions and removal must be symmetric ───────────────
for (const e of effects) check(typeof e.dispose === 'function', `effect "${e.label}" returned no disposer`)
for (const e of effects) e.dispose()
check(Object.keys(dicts).length === 0, 'disposing the effects left dictionaries behind')
check(languages.length === 0, 'disposing the effects left the language behind')

// ── already-registered path must not throw ──────────────────────────────────
const throwingCtx = {
  locale: {
    addLanguage() { throw new Error('locale "it" is already registered') },
    register() { throw new Error('locale namespace already has locale "it"') },
  },
  effect(fn, label) {
    try { fn() } catch (e) { failures.push(`apply threw on the already-registered path (${label}): ${e.message}`) }
  },
}
mod.apply(throwingCtx)

// ── sample values ──────────────────────────────────────────────────────────
console.log('samples:')
for (const [ns, k] of [['common', 'cancel'], ['common', 'brand.localBuild'], ['approval', 'escalation'], ['settings.locale', 'language.title']]) {
  console.log(`  ${ns}.${k} = ${JSON.stringify(expected[ns][k])}`)
}

console.log(`\nnamespaces registered: ${expectedNs.length}   keys: ${totalKeys}   effects: ${expectedNs.length + 1}`)
console.log(`failures: ${failures.length}`)
for (const f of failures) console.log(`  ! ${f}`)
process.exit(failures.length === 0 ? 0 : 1)
