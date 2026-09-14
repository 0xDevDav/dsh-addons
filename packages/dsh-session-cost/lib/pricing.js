/**
 * Pure cost arithmetic for the `sessionCost` projection: price-table
 * normalization, the peak/off-peak tier of one instant, and the view a client
 * renders.
 *
 * The split between folded state and derived money is deliberate. The fold
 * records only durable, price-independent facts — billed token buckets per
 * model and tier — so the persisted projection cache never goes stale when a
 * price changes: `buildView` applies the current table at read time, and
 * editing `prices.json` reprices every session on its next view without a
 * refold.
 *
 * @module dsh-session-cost/pricing
 */

/** Bucket names the fold carries and the view reports. */
const BUCKETS = ['miss', 'hit', 'write', 'out']

/** Tier names, peak first for stable display order. */
const TIERS = ['peak', 'offPeak']

/** Model key used when no request route was recorded before a billed message. */
export const UNKNOWN_MODEL = '(unknown)'

/** Empty per-tier bucket record. */
export function emptyTier() {
  return { miss: 0, hit: 0, write: 0, out: 0, requests: 0 }
}

/** Empty per-model record. */
export function emptyModel() {
  return { peak: emptyTier(), offPeak: emptyTier() }
}

/** Coerce an untrusted token count to a non-negative finite integer. */
export function tokenCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

/**
 * Validate and detach a price table, so a malformed or edited file degrades to
 * a table that prices nothing instead of throwing inside a session fold.
 * @param raw - parsed `prices.json`, or anything else.
 * @returns the normalized table, or `undefined` when it is unusable.
 */
export function normalizeTable(raw) {
  if (typeof raw !== 'object' || raw === null) return undefined
  const peak = raw.peak
  const models = raw.models
  if (typeof peak !== 'object' || peak === null || !Array.isArray(peak.windowsUtc) || !Array.isArray(peak.weekdaysUtc)) return undefined
  if (typeof models !== 'object' || models === null) return undefined
  const windows = []
  for (const window of peak.windowsUtc) {
    if (typeof window !== 'object' || window === null) return undefined
    const from = window.from
    const to = window.to
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return undefined
    windows.push({ from, to })
  }
  const weekdays = peak.weekdaysUtc.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  const normalizedModels = {}
  for (const [id, entry] of Object.entries(models)) {
    if (typeof entry !== 'object' || entry === null) continue
    const rate = (pair) => {
      if (typeof pair !== 'object' || pair === null) return undefined
      if (!Number.isFinite(pair.peak) || !Number.isFinite(pair.offPeak)) return undefined
      return { peak: pair.peak, offPeak: pair.offPeak }
    }
    const input = rate(entry.input)
    const cacheHit = rate(entry.cacheHit)
    const output = rate(entry.output)
    if (input === undefined || cacheHit === undefined || output === undefined) continue
    normalizedModels[id] = {
      label: typeof entry.label === 'string' ? entry.label : id,
      input,
      cacheHit,
      output,
      cacheWrite: rate(entry.cacheWrite)
    }
  }
  const aliases = {}
  if (typeof raw.aliases === 'object' && raw.aliases !== null) {
    for (const [from, to] of Object.entries(raw.aliases)) {
      if (typeof to === 'string' && normalizedModels[to] !== undefined) aliases[from] = to
    }
  }
  return Object.freeze({
    version: typeof raw.version === 'string' ? raw.version : 'unknown',
    currency: typeof raw.currency === 'string' ? raw.currency : 'USD',
    sourceTitle: typeof raw.source?.title === 'string' ? raw.source.title : '',
    sourceUrl: typeof raw.source?.url === 'string' ? raw.source.url : '',
    retrievedAt: typeof raw.source?.retrievedAt === 'string' ? raw.source.retrievedAt : '',
    peak: Object.freeze({ windowsUtc: Object.freeze(windows), weekdaysUtc: Object.freeze(weekdays) }),
    models: Object.freeze(normalizedModels),
    aliases: Object.freeze(aliases)
  })
}

/**
 * The tier one instant is billed under.
 * @param timeMs - epoch milliseconds of the billed request.
 * @param peak - the table's peak definition.
 * @returns `true` inside a peak window on a listed weekday (UTC).
 */
export function isPeakTime(timeMs, peak) {
  if (!Number.isFinite(timeMs)) return false
  const date = new Date(timeMs)
  if (!peak.weekdaysUtc.includes(date.getUTCDay())) return false
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60
  return peak.windowsUtc.some((window) => hour >= window.from && hour < window.to)
}

/**
 * Resolve a model id through the alias table.
 * @param table - normalized table.
 * @param model - the model id recorded in the log.
 * @returns the priced model entry, or `undefined` when the model is unpriced.
 */
export function priceOf(table, model) {
  if (table === undefined || typeof model !== 'string' || model === '') return undefined
  const id = table.aliases[model] ?? model
  const entry = table.models[id]
  if (entry === undefined) return undefined
  return { id, ...entry }
}

/**
 * Fold one billed request into its model-and-tier bucket.
 *
 * Mutates `buckets`, which callers must own: the fold passes a freshly
 * shallow-copied map, and this function replaces the touched model record and
 * tier with fresh objects so no state a previous fold returned is mutated.
 * @param buckets - the owned bucket map keyed by model.
 * @param model - billed model id.
 * @param tier - `peak` or `offPeak`.
 * @param usage - the provider-reported usage record.
 */
export function accumulate(buckets, model, tier, usage) {
  const previous = buckets[model] ?? emptyModel()
  const record = { peak: { ...previous.peak }, offPeak: { ...previous.offPeak } }
  buckets[model] = record
  const target = record[tier]
  target.miss += tokenCount(usage.inputTokens)
  target.hit += tokenCount(usage.cacheReadTokens)
  target.write += tokenCount(usage.cacheWriteTokens)
  target.out += tokenCount(usage.outputTokens)
  target.requests += 1
}

/**
 * Derive the client view: what the panel shows, and nothing else. Money is
 * accumulated **per billed bucket** — cache-miss input, cache-hit input, output,
 * and cache write where a table prices one — so the three lines under the total
 * are its own addends, and the total is their sum by construction.
 * @param state - the projection's folded state.
 * @param table - the normalized price table, or `undefined` when none loaded.
 * @returns the wire view.
 */
export function buildView(state, table) {
  let pricedRequests = 0
  let unpricedRequests = 0
  const cost = { miss: 0, hit: 0, write: 0, out: 0 }

  for (const [model, record] of Object.entries(state.buckets)) {
    const entry = priceOf(table, model)
    for (const tier of TIERS) {
      const bucket = record[tier]
      if (entry === undefined) {
        unpricedRequests += bucket.requests
        continue
      }
      pricedRequests += bucket.requests
      cost.miss += (bucket.miss / 1e6) * entry.input[tier]
      cost.hit += (bucket.hit / 1e6) * entry.cacheHit[tier]
      cost.write += (bucket.write / 1e6) * (entry.cacheWrite === undefined ? 0 : entry.cacheWrite[tier])
      cost.out += (bucket.out / 1e6) * entry.output[tier]
    }
  }

  return {
    currency: table === undefined ? 'USD' : table.currency,
    requests: state.requests,
    pricedRequests,
    unpricedRequests,
    complete: unpricedRequests === 0 && state.requests > 0,
    total: cost.miss + cost.hit + cost.write + cost.out,
    cost
  }
}

export { BUCKETS, TIERS }
