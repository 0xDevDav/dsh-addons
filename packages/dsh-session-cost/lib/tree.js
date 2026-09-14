/**
 * Session-tree cost: the durable-log reader behind the figure the pill shows.
 *
 * Why this lives outside the projection. A projection folds **one** session's
 * log, and a parent's log records only that a child exists (`subagent/catalog`,
 * `tool-workflow/agent-start`) — never the child's token usage, which lives in
 * the child's own log. A tree total therefore has to read other sessions, and
 * reading is I/O that a fold must not do: the fold runs per committed event, so
 * the view has to stay pure and fast.
 *
 * This reader pays that cost on demand instead. It probes every session log's
 * first frame for the cheap facts that describe the tree (id, parent, origin),
 * folds in full only the sessions inside the requested subtree, and caches both
 * against each file's mtime and size — so a finished tree costs a directory scan
 * and a few stats, and a growing one re-folds only what grew.
 *
 * A live session's log may lag its in-memory state (the log is flushed on its own
 * cadence), so a caller-supplied `liveCost` wins wherever the session is still
 * attached: that is both the freshest and the cheapest answer.
 *
 * @module dsh-session-cost/tree
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** The session log filename; the `v3` in it is the format gate this reader checks. */
export const LOG_FILENAME = 'session.v3.jsonl.zstd'

/** Bytes probed for a log's first frame — a session header is a few hundred. */
const HEADER_PROBE_BYTES = 8192

/** How long a directory listing is reused (ms). */
const SCAN_TTL_MS = 5000

/** zstd frame magic, the only boundary a session log's appends respect. */
const FRAME_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

/** Buckets a cost record carries. */
const BUCKETS = ['miss', 'hit', 'write', 'out']

/** An empty bucket record. */
export function emptyCost() {
  return { miss: 0, hit: 0, write: 0, out: 0 }
}

/**
 * Decode a multi-frame zstd session log. Each append is its own frame, and a
 * torn trailing append (a crash mid-write) is dropped rather than thrown.
 * @param buffer - the whole log file, or a prefix of it.
 * @returns the parsed events that decoded cleanly.
 */
export function decodeSessionLog(buffer) {
  const starts = []
  for (let index = 0; index + 3 < buffer.length; index++) {
    if (
      buffer[index] === FRAME_MAGIC[0] &&
      buffer[index + 1] === FRAME_MAGIC[1] &&
      buffer[index + 2] === FRAME_MAGIC[2] &&
      buffer[index + 3] === FRAME_MAGIC[3]
    ) {
      starts.push(index)
    }
  }
  if (starts.length === 0) starts.push(0)
  let text = ''
  let index = 0
  while (index < starts.length) {
    let end = starts[index + 1] ?? buffer.length
    for (;;) {
      try {
        text += zstdDecompressSync(buffer.subarray(starts[index], end)).toString('utf8')
        break
      } catch {
        // A wrong boundary guess (or a truncated tail) becomes a longer frame;
        // the last frame simply stops here.
        if (index + 1 >= starts.length) break
        starts.splice(index + 1, 1)
        end = starts[index + 1] ?? buffer.length
      }
    }
    index++
  }
  const events = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {
      // A partially written final line is not an event yet.
    }
  }
  return events
}

/**
 * Every session log under a sessions root, recursively: the store nests one
 * directory per workspace, and the session directory is named after its id.
 * @param sessionsRoot - the store root.
 * @returns absolute log paths.
 */
export function listSessionLogs(sessionsRoot) {
  const found = []
  const visit = (dir, depth) => {
    if (depth > 4) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path, depth + 1)
      else if (entry.name === LOG_FILENAME) found.push(path)
    }
  }
  visit(sessionsRoot, 0)
  return found
}

/**
 * Create the tree reader.
 * @param options - sessions root, the per-log fold, live-session lookup, and a logger.
 * @returns the reader, exposing `subtree(rootId)`.
 */
export function createTreeReader({ sessionsRoot, fold, liveCost, logger }) {
  /** file → { mtimeMs, size, header } */
  const headers = new Map()
  /** file → { mtimeMs, size, view } */
  const costs = new Map()
  let scan = { at: 0, files: [] }

  const logs = () => {
    const now = Date.now()
    if (now - scan.at > SCAN_TTL_MS) scan = { at: now, files: existsSync(sessionsRoot) ? listSessionLogs(sessionsRoot) : [] }
    return scan.files
  }

  const stamp = (file) => {
    try {
      const stat = statSync(file)
      return { mtimeMs: stat.mtimeMs, size: stat.size }
    } catch {
      return undefined
    }
  }

  /** The session header, from the first frame alone wherever the probe suffices. */
  const headerOf = (file, current) => {
    const cached = headers.get(file)
    if (cached !== undefined && cached.mtimeMs === current.mtimeMs && cached.size === current.size) return cached.header
    let header
    try {
      const probe = readFileSync(file, { length: Math.min(current.size, HEADER_PROBE_BYTES) })
      const first = decodeSessionLog(probe)[0]
      header = first !== undefined && first.type === 'session' ? first : undefined
      if (header === undefined) {
        // The first frame outgrew the probe: pay for the whole file once.
        const whole = decodeSessionLog(readFileSync(file))[0]
        header = whole !== undefined && whole.type === 'session' ? whole : undefined
      }
    } catch (error) {
      logger?.warn?.(`session-cost: cannot read the header of ${file} (${error.message}); its subtree is invisible to the tree figure`)
      header = undefined
    }
    headers.set(file, { mtimeMs: current.mtimeMs, size: current.size, header })
    return header
  }

  /** One session's own view, folded from its full log. */
  const costOf = (file, current, header) => {
    const cached = costs.get(file)
    if (cached !== undefined && cached.mtimeMs === current.mtimeMs && cached.size === current.size) return cached.view
    let view
    try {
      view = fold(decodeSessionLog(readFileSync(file)), header)
    } catch (error) {
      logger?.warn?.(`session-cost: cannot fold ${file} (${error.message})`)
      view = undefined
    }
    costs.set(file, { mtimeMs: current.mtimeMs, size: current.size, view })
    return view
  }

  /**
   * The cost of one session and every session below it.
   * @param rootId - the session whose subtree to total.
   * @returns the summed view, plus how many sessions it covers.
   */
  const subtree = (rootId) => {
    const files = logs()
    const parentOf = new Map()
    const fileOf = new Map()
    for (const file of files) {
      const current = stamp(file)
      if (current === undefined) continue
      const header = headerOf(file, current)
      if (header === undefined) continue
      const id = typeof header.id === 'string' ? header.id : undefined
      if (id === undefined) continue
      fileOf.set(id, file)
      if (typeof header.parentSession === 'string') parentOf.set(id, header.parentSession)
    }
    const childrenOf = new Map()
    for (const [id, parent] of parentOf) {
      const list = childrenOf.get(parent) ?? []
      list.push(id)
      childrenOf.set(parent, list)
    }

    const members = [rootId]
    for (let index = 0; index < members.length; index++) {
      for (const child of childrenOf.get(members[index]) ?? []) if (!members.includes(child)) members.push(child)
    }

    const cost = emptyCost()
    let total = 0
    let requests = 0
    let pricedRequests = 0
    let unpricedRequests = 0
    let unreadable = 0
    for (const id of members) {
      let view
      const live = liveCost?.(id)
      if (live !== undefined) view = live
      else {
        const file = fileOf.get(id)
        if (file !== undefined) {
          const current = stamp(file)
          if (current !== undefined) view = costOf(file, current, headers.get(file)?.header)
        }
      }
      if (view === undefined) {
        unreadable++
        continue
      }
      total += view.total
      requests += view.requests
      pricedRequests += view.pricedRequests
      unpricedRequests += view.unpricedRequests
      for (const bucket of BUCKETS) cost[bucket] += view.cost[bucket]
    }

    return {
      currency: 'USD',
      total,
      cost,
      requests,
      pricedRequests,
      unpricedRequests,
      complete: unreadable === 0 && unpricedRequests === 0,
      sessions: members.length,
      unreadable
    }
  }

  return { subtree }
}
