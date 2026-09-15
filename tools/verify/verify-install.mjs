// Integrity check of an npx-cached DeepSeek Harness installation.
//
// Counting packages and asking the CLI for its version proves nothing: `--version`
// loads no plugin, and a package can be present with its files truncated (a killed
// `npm install` leaves exactly that). Three things are checked, in order of strength:
//
//   1. every directory under node_modules carries a package.json
//      (a package whose extraction never finished)
//   2. every dependency a package declares resolves from that package
//      (a tree missing whole packages)
//   3. every runtime file a package declares exists — and when one does not, the
//      published tarball decides whether that is damage or upstream packaging.
//      This matters both ways: `zod/v4/classic/external.js` missing is a killed
//      install, while `@modelcontextprotocol/sdk@1.30.0` genuinely ships without
//      the `dist/esm/index.js` its own exports map names. Without the tarball
//      cross-check a report is either noise or a miss.
//
// usage: node verify-install.mjs [path] [--offline]
//   path may be the npx cache directory or its node_modules; with no argument the
//   newest cached installation containing @deepseek-ai/dsh is checked.
//   --offline keeps it to checks 1 and 2 and reports check 3 as unverified.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const OFFLINE = process.argv.includes('--offline')

/** Every cache directory under the npm npx cache that holds a harness install. */
function cachedInstallations() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx')
  const found = []
  let entries = []
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return found }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    const manifest = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    if (!fs.existsSync(manifest)) continue
    let version = '?'
    try { version = JSON.parse(fs.readFileSync(manifest, 'utf8')).version } catch { /* reported by the static checks */ }
    found.push({ dir, version, when: fs.statSync(dir).mtimeMs, lock: fs.existsSync(path.join(dir, 'concurrency.lock')) })
  }
  return found.sort((a, b) => b.when - a.when)
}

/** Resolve the node_modules to check, from the command line or by recency. */
function resolveModules() {
  const given = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
  if (given) {
    const absolute = path.resolve(given)
    return absolute.endsWith('node_modules') ? absolute : path.join(absolute, 'node_modules')
  }
  const newest = cachedInstallations()[0]
  if (!newest) {
    console.error('no cached harness installation found; pass a path')
    process.exit(2)
  }
  console.log(`checking the newest cached installation: ${newest.dir}  (@deepseek-ai/dsh ${newest.version})`)
  return path.join(newest.dir, 'node_modules')
}

/** Every installed package directory, plus the directories that carry no manifest. */
function listPackages(modules) {
  const packages = []
  const truncated = []
  let entries = []
  try { entries = fs.readdirSync(modules, { withFileTypes: true }) } catch (error) {
    console.error(`cannot read ${modules}: ${error.message}`)
    process.exit(2)
  }
  const consider = (dir, name) => {
    if (fs.existsSync(path.join(dir, 'package.json'))) packages.push({ name, dir })
    else truncated.push(dir)
  }
  for (const entry of entries) {
    if (entry.name === '.bin') continue
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (!entry.name.startsWith('@')) {
      consider(path.join(modules, entry.name), entry.name)
      continue
    }
    let children = []
    try { children = fs.readdirSync(path.join(modules, entry.name), { withFileTypes: true }) } catch { continue }
    for (const child of children) {
      if (!child.isDirectory() && !child.isSymbolicLink()) continue
      consider(path.join(modules, entry.name, child.name), `${entry.name}/${child.name}`)
    }
  }
  return { packages, truncated }
}

/**
 * Conditions Node itself honours when resolving a package. A target behind a custom
 * condition (a bundler-only key such as `standard-schema-spec`) proves nothing: it
 * may point at sources that never ship.
 */
const RUNTIME_CONDITIONS = new Set(['node', 'import', 'require', 'default', 'types'])

/**
 * Declaration and source files. A package can declare `types` for a file it does not
 * ship (editors only, never the runtime), so their absence is not damage.
 */
const DECLARATION_OR_SOURCE = /\.(d\.ts|d\.cts|d\.mts|ts|tsx|mts|cts)$/

/** Every runtime file path a package's manifest points at. */
function declaredFiles(manifest) {
  const wanted = []
  const add = (value) => {
    if (typeof value !== 'string') return
    if (!value.startsWith('./')) return
    if (value.includes('*') || value.includes('?')) return
    if (DECLARATION_OR_SOURCE.test(value)) return
    wanted.push(value)
  }
  const walkExport = (value) => {
    if (typeof value === 'string') { add(value); return }
    if (Array.isArray(value)) { value.forEach(walkExport); return }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.startsWith('.')) walkExport(child)
        else if (RUNTIME_CONDITIONS.has(key)) walkExport(child)
      }
    }
  }
  add(manifest.main)
  add(manifest.module)
  if (typeof manifest.bin === 'string') add(manifest.bin)
  else if (manifest.bin && typeof manifest.bin === 'object') Object.values(manifest.bin).forEach(add)
  if (manifest.exports) walkExport(manifest.exports)
  return [...new Set(wanted)]
}

/**
 * Whether a declared target exists, the way Node looks for it: the path itself, the
 * path plus a known extension, or a directory carrying its own package.json or an
 * `index.*`. `main: "./index"` with `index.js` on disk is correct, not damage.
 */
function targetExists(dir, target) {
  const base = path.join(dir, target)
  if (!fs.existsSync(base)) return ['.js', '.json', '.node'].some((extension) => fs.existsSync(base + extension))
  let isDirectory = false
  try { isDirectory = fs.statSync(base).isDirectory() } catch { return true }
  if (!isDirectory) return true
  if (fs.existsSync(path.join(base, 'package.json'))) return true
  return ['index.js', 'index.json', 'index.node'].some((name) => fs.existsSync(path.join(base, name)))
}

/** The directory Node would look in for `name`, walking up from `from`. */
function resolves(from, name) {
  let dir = from
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** Where a stub listing of published files would live, for hermetic tests. */
const STUB_DIR = process.env.DSH_VERIFY_TARBALL_DIR

const tarballCache = new Map()

/**
 * The file list of a package's published tarball, so a declared-but-absent file can be
 * judged against what upstream actually ships. Returns undefined when unavailable.
 */
function publishedFiles(name, version) {
  const key = `${name}@${version}`
  if (tarballCache.has(key)) return tarballCache.get(key)
  if (STUB_DIR) {
    const stub = path.join(STUB_DIR, `${name.replace('/', '+')}-${version}.files`)
    const listing = fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean) : undefined
    tarballCache.set(key, listing)
    return listing
  }
  if (OFFLINE) { tarballCache.set(key, undefined); return undefined }
  const tarball = path.join(os.tmpdir(), `dsh-verify-${name.replace('/', '+')}-${version}.tgz`)
  let listing
  try {
    if (!fs.existsSync(tarball)) {
      const url = `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`
      execFileSync(process.execPath, ['-e', `
        const fs = require('fs')
        fetch(${JSON.stringify(url)}).then(async (response) => {
          if (!response.ok) process.exit(1)
          fs.writeFileSync(${JSON.stringify(tarball)}, Buffer.from(await response.arrayBuffer()))
        }).catch(() => process.exit(1))
      `], { stdio: 'ignore' })
    }
    listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n').map((line) => line.trim()).filter(Boolean)
  } catch {
    listing = undefined
  }
  tarballCache.set(key, listing)
  return listing
}

const modules = resolveModules()
const { packages, truncated } = listPackages(modules)

const absent = []
const missingDeps = []
let checkedFiles = 0
let checkedDeps = 0

for (const pkg of packages) {
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(path.join(pkg.dir, 'package.json'), 'utf8')) } catch (error) {
    absent.push({ pkg: pkg.name, file: 'package.json', why: `unreadable: ${error.message}`, verdict: 'damage' })
    continue
  }
  for (const target of declaredFiles(manifest)) {
    checkedFiles++
    if (targetExists(pkg.dir, target)) continue
    // The published tarball decides: shipped there but missing here is damage.
    const published = publishedFiles(manifest.name ?? pkg.name, manifest.version ?? '?')
    let verdict = 'unverified'
    if (published) verdict = published.some((entry) => entry === `package${target.slice(1)}`) ? 'damage' : 'upstream'
    absent.push({ pkg: pkg.name, file: target, why: 'declared but absent', verdict })
  }
  const dependencies = manifest.dependencies ?? {}
  for (const name of Object.keys(dependencies)) {
    checkedDeps++
    if (!resolves(pkg.dir, name)) missingDeps.push({ pkg: pkg.name, dep: name, range: dependencies[name] })
  }
}

const damage = absent.filter((item) => item.verdict === 'damage')
const upstream = absent.filter((item) => item.verdict === 'upstream')
const unverified = absent.filter((item) => item.verdict === 'unverified')

const show = (items, render, limit = 25) => {
  for (const item of items.slice(0, limit)) console.log('  ' + render(item))
  if (items.length > limit) console.log(`  ... and ${items.length - limit} more`)
}

console.log('')
console.log(`packages:        ${packages.length}`)
console.log(`files declared:  ${checkedFiles}`)
console.log(`deps declared:   ${checkedDeps}`)
console.log('')
console.log(`half-written packages (no package.json):   ${truncated.length}`)
show(truncated, (dir) => path.relative(modules, dir))
console.log(`dependencies that do not resolve:          ${missingDeps.length}`)
show(missingDeps, (item) => `${item.pkg} needs ${item.dep}@${item.range}`)
console.log(`declared files absent here and shipped upstream (damage): ${damage.length}`)
show(damage, (item) => `${item.pkg}  ->  ${item.file}`)
console.log(`declared files absent from the published package too (upstream packaging, harmless): ${upstream.length}`)
show(upstream, (item) => `${item.pkg}  ->  ${item.file}`)
console.log(`declared files absent, published package not consulted:    ${unverified.length}`)
show(unverified, (item) => `${item.pkg}  ->  ${item.file}`)

const problems = truncated.length + missingDeps.length + damage.length
console.log('')
if (problems === 0) {
  console.log('VERDICT: sound. Every package has its manifest, its dependencies resolve, and no')
  console.log('         runtime file the installation should have is missing.')
} else {
  console.log(`VERDICT: DAMAGED (${problems} fault${problems === 1 ? '' : 's'}). Delete this cache directory and let npx`)
  console.log('         install it again. Never remove a leftover concurrency.lock and carry on:')
  console.log('         that lock is the signature of an install that was killed halfway.')
}
process.exit(problems === 0 ? 0 : 1)
