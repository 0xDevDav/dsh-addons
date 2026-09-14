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

/** Every `session.v3.jsonl.zstd` log under the session store. */
export function sessionLogs(root = sessionsRoot()) {
  const found = []
  const visit = (dir, depth) => {
    if (depth > 4) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(full, depth + 1)
      else if (entry.name === 'session.v3.jsonl.zstd') found.push(full)
    }
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
