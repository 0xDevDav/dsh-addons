import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// v2: extract every locale dictionary registered by shipped client plugins.
// Handles shorthand/aliased dicts, cross-referenced consts, and per-locale calls.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = packagesRoot()
const OUT = (import.meta.dirname + '/dicts.json')

/** Read a balanced {...} or [...] literal starting at index of the opener. */
function balanced(src, start) {
  const open = src[start]
  const close = open === '{' ? '}' : open === '(' ? ')' : ']'
  let depth = 0
  let i = start
  let mode = null
  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]
    if (mode === 'line') { if (ch === '\n') mode = null }
    else if (mode === 'block') { if (ch === '*' && next === '/') { mode = null; i++ } }
    else if (mode) {
      if (ch === '\\') i++
      else if (ch === mode) mode = null
      else if (mode === '`' && ch === '$' && next === '{') { /* template holes: treat as text */ }
    }
    else if (ch === '/' && next === '/') { mode = 'line'; i++ }
    else if (ch === '/' && next === '*') { mode = 'block'; i++ }
    else if (ch === '"' || ch === "'" || ch === '`') mode = ch
    else if (ch === open) depth++
    else if (ch === close) { depth--; if (depth === 0) return src.slice(start, i + 1) }
    i++
  }
  return null
}

/** Split an object/array body into top-level segments. */
function splitTopLevel(body) {
  const parts = []
  let depth = 0
  let mode = null
  let current = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    const next = body[i + 1]
    if (mode) {
      current += ch
      if (ch === '\\') { current += next ?? ''; i++ }
      else if (ch === mode) mode = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { mode = ch; current += ch; continue }
    if (ch === '{' || ch === '[' || ch === '(') depth++
    if (ch === '}' || ch === ']' || ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** Collect every `const NAME = "..."` and `const NAME = {...}` / `const NAME = [...]` literal. */
function collectConsts(src) {
  const strings = new Map()
  const literals = new Map()
  const re = /(?:^|\n)[ \t]*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g
  let m
  while ((m = re.exec(src))) {
    const name = m[1]
    const at = m.index + m[0].length
    const ch = src[at]
    if (ch === '{' || ch === '[') {
      const lit = balanced(src, at)
      if (lit && !literals.has(name)) literals.set(name, lit)
    } else if (ch === '"') {
      const strLit = /^"(?:[^"\\]|\\.)*"/.exec(src.slice(at))
      if (strLit) { try { strings.set(name, JSON.parse(strLit[0])) } catch { /* ignore */ } }
    }
  }
  return { strings, literals }
}

/** Evaluate literals in dependency order, exposing already-known names as parameters. */
function resolveScope(literals, strings) {
  const values = new Map(strings)
  const errors = new Map()
  let progress = true
  const pending = new Map(literals)
  while (progress && pending.size) {
    progress = false
    for (const [name, lit] of [...pending]) {
      const params = [...values.keys()]
      const args = params.map((p) => values.get(p))
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(...params, `return (${lit})`)
        values.set(name, fn(...args))
        pending.delete(name)
        progress = true
      } catch (e) {
        errors.set(name, String(e))
      }
    }
  }
  return { values, unresolved: [...pending.keys()], errors }
}

const files = []
for (const pkg of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, pkg)
  if (!fs.statSync(dir).isDirectory()) continue
  const client = path.join(dir, 'lib', 'client.js')
  if (fs.existsSync(client)) files.push({ pkg, file: client })
}

const result = {}
const problems = []
let registerCalls = 0

for (const { pkg, file } of files) {
  const src = fs.readFileSync(file, 'utf8')
  const { strings, literals } = collectConsts(src)
  const scope = resolveScope(literals, strings)

  const callRe = /(?:[A-Za-z_$][\w$]*\.)?locale\.register\s*\(/g
  let m
  while ((m = callRe.exec(src))) {
    registerCalls++
    const argsText = balanced(src, m.index + m[0].length - 1)?.slice(1, -1) ?? ''
    const args = splitTopLevel(argsText)
    if (args.length < 2) { problems.push({ pkg, reason: `unparsed args: ${argsText.slice(0, 100)}` }); continue }

    let ns = null
    if (/^"(?:[^"\\]|\\.)*"$/.test(args[0])) ns = JSON.parse(args[0])
    else ns = strings.get(args[0]) ?? null
    if (!ns) { problems.push({ pkg, reason: `namespace unresolved: ${args[0]}` }); continue }

    const dicts = ((result[ns] ??= {})[pkg] ??= {})
    const record = (locale, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) dicts[locale] = { value }
      else problems.push({ pkg, ns, reason: `dict ${locale} not an object` })
    }

    const valueOf = (expr) => {
      const e = expr.trim()
      if (e.startsWith('{')) {
        try {
          const params = [...scope.values.keys()]
          // eslint-disable-next-line no-new-func
          return new Function(...params, `return (${e})`)(...params.map((p) => scope.values.get(p)))
        } catch (err) { problems.push({ pkg, ns, reason: `eval inline: ${err}` }); return null }
      }
      if (scope.values.has(e)) return scope.values.get(e)
      problems.push({ pkg, ns, reason: `unknown identifier: ${e}` })
      return null
    }

    // Per-locale form: register(ns, '<id>', dict)
    if (/^"(?:[^"\\]|\\.)*"$/.test(args[1]) && args.length >= 3) {
      record(JSON.parse(args[1]), valueOf(args[2]))
      continue
    }

    const second = args[1].trim()
    if (second.startsWith('{')) {
      for (const seg of splitTopLevel(second.slice(1, -1))) {
        const kv = /^([A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*")\s*(?::\s*([\s\S]+))?$/.exec(seg)
        if (!kv) { problems.push({ pkg, ns, reason: `prop? ${seg.slice(0, 60)}` }); continue }
        const key = kv[1].startsWith('"') ? JSON.parse(kv[1]) : kv[1]
        record(key, valueOf(kv[2] ?? kv[1]))
      }
      continue
    }
    if (second.startsWith('[')) {
      // register(ns, locale, dict) driven by a [[locale, dict], ...] table
      for (const seg of splitTopLevel(second.slice(1, -1))) {
        const pair = splitTopLevel(seg.replace(/^\[|\]$/g, ''))
        if (pair.length !== 2) { problems.push({ pkg, ns, reason: `pair? ${seg.slice(0, 60)}` }); continue }
        record(pair[0].replace(/^"|"$/g, ''), valueOf(pair[1]))
      }
      continue
    }
    // register(ns, localeVar, dictVar) inside a loop over a table const
    if (args.length >= 3) {
      let table = scope.values.get(second)
      if (!Array.isArray(table)) {
        // Locate the loop that binds this identifier: for (const [a, b] of TABLE)
        const loopRe = /for\s*\(\s*const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*of\s+([A-Za-z_$][\w$]*)\s*\)/g
        let lm
        while ((lm = loopRe.exec(src))) {
          if (lm[1] === second || lm[2] === args[2].trim()) {
            table = scope.values.get(lm[3])
            break
          }
        }
      }
      if (Array.isArray(table)) {
        for (const pair of table) {
          if (Array.isArray(pair) && pair.length === 2) record(String(pair[0]), pair[1])
        }
        continue
      }
    }
    problems.push({ pkg, ns, reason: `unhandled form: ${argsText.slice(0, 120)}` })
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(result, null, 1))

const summary = []
let totalEn = 0
let totalZh = 0
for (const [ns, owners] of Object.entries(result)) {
  const enKeys = new Set()
  const zhKeys = new Set()
  for (const dicts of Object.values(owners)) {
    for (const k of Object.keys(dicts.en?.value ?? {})) enKeys.add(k)
    for (const k of Object.keys(dicts.zh?.value ?? {})) zhKeys.add(k)
  }
  totalEn += enKeys.size
  totalZh += zhKeys.size
  summary.push({ ns, en: enKeys.size, zh: zhKeys.size, owners: Object.keys(owners).join(',') })
}
summary.sort((a, b) => b.en - a.en)
console.log(`bundles: ${files.length}  register calls: ${registerCalls}  namespaces: ${summary.length}`)
console.log(`total EN keys: ${totalEn}   total ZH keys: ${totalZh}\n`)
for (const s of summary) console.log(`${String(s.en).padStart(4)} ${String(s.zh).padStart(4)}  ${s.ns.padEnd(32)} ${s.owners}`)
console.log(`\nproblems: ${problems.length}`)
for (const p of problems) console.log(` - ${p.pkg} ${p.ns ?? ''}: ${p.reason}`)
