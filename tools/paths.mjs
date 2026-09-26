/**
 * Portable lookups for the tools in this repository: they read the machine's own
 * DSH home and the shipped packages through the profile's module fallback, so
 * nothing here is tied to one installation path.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** The Harness home: `$DSH_HOME`, else the documented `~/.dsh` default. */
export function harnessHome() {
  return process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
}

/** Absolute path of one profile plugin directory (`<home>/profiles/web/plugins/<name>`). */
export function packPath(name, profile = 'web') {
  return path.join(harnessHome(), 'profiles', profile, 'plugins', name)
}

/** The shipped `@deepseek-ai` package directory, through the profile module fallback. */
export function packagesRoot() {
  const configured = process.env.DSH_PACKAGES_ROOT
  if (configured !== undefined && configured !== '') return configured
  return path.join(harnessHome(), 'profiles', 'node_modules', '@deepseek-ai')
}

/** The session store root. */
export function sessionsRoot() {
  return path.join(harnessHome(), 'sessions')
}

/**
 * The log of one session directory: the newest `session.v<N>.jsonl.zstd` from
 * generation 3 on. DSH 0.1.7 writes V4 and leaves a V3 log in place when it
 * carries a session forward, so the highest generation is the session.
 */
export function sessionLogIn(dir) {
  let names
  try { names = fs.readdirSync(dir) } catch { return undefined }
  let best
  for (const name of names) {
    const match = /^session\.v([1-9][0-9]*)\.jsonl\.zstd$/.exec(name)
    const generation = match === null ? 0 : Number(match[1])
    if (generation >= 3 && (best === undefined || generation > best.generation)) best = { generation, name }
  }
  return best === undefined ? undefined : path.join(dir, best.name)
}

/** Every session log under the session store, one per session directory. */
export function sessionLogs(root = sessionsRoot()) {
  const found = []
  const visit = (dir, depth) => {
    if (depth > 4) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    const own = sessionLogIn(dir)
    if (own !== undefined) found.push(own)
    for (const entry of entries) if (entry.isDirectory()) visit(path.join(dir, entry.name), depth + 1)
  }
  visit(root, 0)
  return found
}

/** The most recently modified session log, for tools that default to "the current one". */
export function newestSessionLog(root = sessionsRoot()) {
  const logs = sessionLogs(root)
  if (logs.length === 0) return undefined
  return logs.reduce((best, file) => (fs.statSync(file).mtimeMs > fs.statSync(best).mtimeMs ? file : best), logs[0])
}

/**
 * The id of a root session (one whose header names no parent), read from the
 * session directory name: the store names each directory after its session.
 */
export function rootSessionId(root = sessionsRoot()) {
  for (const file of sessionLogs(root)) {
    const directory = path.basename(path.dirname(file))
    if (!directory.startsWith('session-')) continue
    return directory
  }
  const logs = sessionLogs(root)
  return logs.length === 0 ? undefined : path.basename(path.dirname(logs[0]))
}
