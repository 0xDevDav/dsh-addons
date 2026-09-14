/**
 * `dsh-session-cost` host half: the `sessionCost` projection unit.
 *
 * Why this is a host projection and not a client fold. The figures the stats
 * strip already shows come from two places: `sessionStats` (a whole-log host
 * projection) and `tokenUsage` (a client-side sum over the loaded window). A
 * cost figure needs something neither of them keeps: the *instant* of every
 * billed request, because DeepSeek prices peak and off-peak hours differently.
 * Only the durable log carries a time per request, so the fold runs where the
 * log is authoritative and the browser reads the result like any other
 * projection.
 *
 * Neither the provider nor DSH supplies money. The API returns token counts
 * only (`prompt_tokens`, `prompt_cache_hit_tokens`, `completion_tokens`,
 * `reasoning_tokens`); the DeepSeek adapter records them as
 * `inputTokens`/`cacheReadTokens`/`outputTokens`/`reasoningTokens`, and DSH
 * deliberately drops the cost metadata a third-party SDK may attach
 * (`dsh-llm-pi-ai` zeroes `usage.cost` and no consumer reads it). Cost is
 * therefore derived: billed tokens x published rates, per request, by tier.
 *
 * @module dsh-session-cost
 */

import { z } from 'zod'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accumulate, buildView, isPeakTime, normalizeTable, UNKNOWN_MODEL } from './pricing.js'
import { createTreeReader } from './tree.js'

/** Cordis plugin name. */
const name = 'session-cost'

/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
const inject = ['sessionProjections']

/** The projection key both halves address. */
const PROJECTION_KEY = 'sessionCost'

/** The price table shipped beside this module. */
const PRICE_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'prices.json')

/** Same-origin route the browser reads the tree figure from. */
const TREE_PATH = '/session-cost/tree'

/** Same-origin route the browser reads the account balance from. */
const BALANCE_PATH = '/session-cost/balance'

/**
 * The credential reference the DeepSeek adapter resolves by default, and the
 * endpoint variable it honors. Reading the balance means reading the same two
 * things the model calls do, never a second, parallel source of credentials.
 */
const BALANCE_KEY_REF = 'DEEPSEEK_API_KEY'
const BALANCE_BASE_URL_ENV = 'DEEPSEEK_BASE_URL'
const BALANCE_PUBLIC_BASE_URL = 'https://api.deepseek.com'
const BALANCE_API_PATH = '/user/balance'

/** How long one balance answer is reused (ms); it is money, not a live feed. */
const BALANCE_TTL_MS = 60000

/** How long the provider may take before the answer is treated as absent (ms). */
const BALANCE_TIMEOUT_MS = 10000

/** Same-origin route the browser reads the peak-window definition from. */
const PEAK_PATH = '/session-cost/peak'

/** The route's answer is cached briefly so a burst of client reads folds once. */
const TREE_TTL_MS = 1000

/** How long a loaded table is reused before the file is re-checked (ms). */
const PRICE_CACHE_MS = 5000

/** The projection's wire key, exported so the browser half and specs share one constant. */
export { PROJECTION_KEY }

/** One model-and-tier bucket record, the fold's smallest owned fact. */
const tierSchema = z
  .object({
    miss: z.number().nonnegative(),
    hit: z.number().nonnegative(),
    write: z.number().nonnegative(),
    out: z.number().nonnegative(),
    requests: z.number().int().nonnegative()
  })
  .strict()

/** One model's two tier buckets. */
const modelStateSchema = z.object({ peak: tierSchema, offPeak: tierSchema }).strict()

/** The fold state: durable, price-independent token facts plus the open route/step. */
const stateSchema = z
  .object({
    route: z.object({ provider: z.string(), model: z.string() }).strict().nullable(),
    openStep: z
      .object({
        turn: z.number().int().nonnegative(),
        step: z.number().int().nonnegative(),
        startTime: z.number().nonnegative()
      })
      .strict()
      .nullable(),
    requests: z.number().int().nonnegative(),
    usageMissing: z.number().int().nonnegative(),
    buckets: z.record(z.string(), modelStateSchema)
  })
  .strict()

/** The client view: the panel's addends and the total they sum to. */
const viewSchema = z
  .object({
    currency: z.string(),
    requests: z.number().int().nonnegative(),
    pricedRequests: z.number().int().nonnegative(),
    unpricedRequests: z.number().int().nonnegative(),
    complete: z.boolean(),
    total: z.number().nonnegative(),
    cost: z
      .object({
        miss: z.number().nonnegative(),
        hit: z.number().nonnegative(),
        write: z.number().nonnegative(),
        out: z.number().nonnegative()
      })
      .strict()
  })
  .strict()

/**
 * A lazily re-read price table. Prices change under a long-lived process, so
 * the file is re-checked at most once per {@link PRICE_CACHE_MS}: an edit
 * reprices every session on its next view, with no refold and no restart,
 * while ordinary view production costs one `stat` at most.
 * @param path - the price table's path.
 * @param logger - Cordis logger for load failures.
 * @returns a reader exposing the current normalized table.
 */
function createPriceTableLoader(path, logger) {
  let table
  let stamp
  let checkedAt = 0
  let warned = false
  const load = () => {
    checkedAt = Date.now()
    try {
      const next = String(statSync(path).mtimeMs)
      if (table !== undefined && next === stamp) return
      const normalized = normalizeTable(JSON.parse(readFileSync(path, 'utf8')))
      if (normalized === undefined) throw new Error('price table has an unexpected shape')
      table = normalized
      stamp = next
      warned = false
    } catch (error) {
      if (!warned) {
        warned = true
        logger?.warn?.(`session-cost: cannot read ${path} (${error.message}); requests stay unpriced until it is readable`)
      }
    }
  }
  return {
    get() {
      if (Date.now() - checkedAt > PRICE_CACHE_MS) load()
      return table
    }
  }
}

/** The `sessionCost` unit registered on `ctx.sessionProjections`. */
export function createDefinition(priceTable) {
  return {
    key: PROJECTION_KEY,
    stateVersion: 1,
    stateSchema,
    init: () => ({
      route: null,
      openStep: null,
      requests: 0,
      usageMissing: 0,
      buckets: {}
    }),
    apply: (state, event) => {
      switch (event.type) {
        case 'step/start': {
          return {
            ...state,
            openStep: { turn: event.data.turn, step: event.data.step, startTime: event.time }
          }
        }
        case 'step/end':
        case 'turn/end': {
          return state.openStep === null ? state : { ...state, openStep: null }
        }
        case 'request/header': {
          const config = event.data?.header?.config
          if (typeof config?.model !== 'string' || config.model === '') return state
          const provider = typeof config.provider === 'string' ? config.provider : ''
          if (state.route !== null && state.route.provider === provider && state.route.model === config.model) return state
          return { ...state, route: { provider, model: config.model } }
        }
        case 'request/context': {
          const model = event.data?.model
          if (typeof model !== 'string' || model === '') return state
          if (state.route !== null && state.route.model === model) return state
          const provider = typeof event.data?.provider === 'string' ? event.data.provider : ''
          return { ...state, route: { provider, model } }
        }
        case 'assistant/message': {
          const usage = event.data?.usage
          if (usage === undefined || usage === null) return { ...state, usageMissing: state.usageMissing + 1 }
          // The request's initiation time decides the tier: the billed window is
          // the one the call was issued in, and the recorded step start is the
          // closest durable instant to it.
          const at = state.openStep === null ? event.time : state.openStep.startTime
          const tier = isPeakTime(at, priceTable.get()?.peak ?? { weekdaysUtc: [], windowsUtc: [] }) ? 'peak' : 'offPeak'
          const buckets = { ...state.buckets }
          const model = state.route === null ? UNKNOWN_MODEL : state.route.model
          accumulate(buckets, model, tier, usage)
          return { ...state, requests: state.requests + 1, buckets, openStep: null }
        }
        default:
          return state
      }
    },
    wire: {
      viewSchema,
      view: (state) => buildView(state, priceTable.get())
    }
  }
}

/**
 * The harness home: `$DSH_HOME`, else the documented `~/.dsh` default.
 * @returns the home directory.
 */
function resolveHarnessHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured !== '') return configured
  return join(homedir(), '.dsh')
}

/**
 * Normalize one `/user/balance` answer. Amounts stay the exact strings the
 * provider sent: nothing here does arithmetic on money, so nothing here can
 * round it.
 * @param json - the parsed response body.
 * @returns the client view, or an explicit unavailability.
 */
export function normalizeBalance(json, now = Date.now()) {
  if (typeof json !== 'object' || json === null || !Array.isArray(json.balance_infos)) {
    return { available: false, reason: 'malformed' }
  }
  const text = (value) => (typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '')
  const balances = []
  for (const info of json.balance_infos) {
    if (typeof info !== 'object' || info === null) continue
    const currency = typeof info.currency === 'string' ? info.currency : ''
    if (currency === '') continue
    balances.push({
      currency,
      total: text(info.total_balance),
      granted: text(info.granted_balance),
      toppedUp: text(info.topped_up_balance)
    })
  }
  return { available: true, isAvailable: json.is_available === true, balances, fetchedAt: now }
}

/**
 * Resolve the provider credential the way the DeepSeek adapter does: the
 * credentials service first, the launching environment second.
 * @param ctx - host context.
 * @returns the key and its source layer, or an explicit absence.
 */
async function resolveBalanceKey(ctx) {
  const ref = credentialRef(BALANCE_KEY_REF)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined && typeof hit.value === 'string' && hit.value !== '') return { key: hit.value, source: hit.source }
    } catch (error) {
      ctx.logger?.warn?.(`session-cost: cannot resolve ${BALANCE_KEY_REF} through the credentials service (${error?.message ?? error})`)
    }
  }
  const ambient = process.env[BALANCE_KEY_REF]
  if (typeof ambient === 'string' && ambient !== '') return { key: ambient, source: 'env' }
  return {}
}

/**
 * Read the account balance, reusing one answer for {@link BALANCE_TTL_MS} so a
 * page that polls cannot turn into a stream of provider calls.
 * @param ctx - host context.
 * @returns a reader exposing `read()`.
 */
export function createBalanceReader(ctx) {
  let cached
  return {
    async read() {
      if (cached !== undefined && Date.now() - cached.at < BALANCE_TTL_MS) return cached.value
      const { key, source } = await resolveBalanceKey(ctx)
      let value
      if (key === undefined) value = { available: false, reason: 'missing-credential' }
      else {
        const base = (process.env[BALANCE_BASE_URL_ENV] ?? BALANCE_PUBLIC_BASE_URL).replace(/\/+$/u, '')
        try {
          const response = await fetch(base + BALANCE_API_PATH, {
            headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
            signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS)
          })
          if (!response.ok) value = { available: false, reason: response.status === 401 || response.status === 403 ? 'unauthorized' : `http-${response.status}` }
          else {
            const view = normalizeBalance(await response.json())
            // The key's source is only part of a real answer: a refusal has no use for it.
            value = view.available === true ? { ...view, source } : view
          }
        } catch (error) {
          value = { available: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'network' }
        }
      }
      cached = { at: Date.now(), value }
      return value
    }
  }
}

/**
 * Resolve one balance request into a response.
 * @param req - the HTTP request.
 * @param reader - the balance reader.
 * @returns the status and JSON body to answer with.
 */
async function resolveBalanceRequest(req, reader) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return { status: 405, body: { error: 'method-not-allowed' } }
  try {
    return { status: 200, body: await reader.read() }
  } catch (error) {
    return { status: 500, body: { error: 'internal', message: String(error?.message ?? error) } }
  }
}

/**
 * The peak-window definition the browser needs to describe the schedule in the
 * reader's own zone. The windows are published in UTC, and only the price table
 * knows them, so the browser cannot derive them by itself.
 * @param table - the normalized price table, or `undefined` when none loaded.
 * @returns the definition, or an explicit unavailability.
 */
export function peakDefinition(table) {
  if (table === undefined) return { available: false }
  const first = Object.values(table.models)[0]
  const offPeakHalf = first === undefined ? undefined : first.input.offPeak * 2 === first.input.peak
  return {
    available: true,
    windowsUtc: table.peak.windowsUtc.map((window) => ({ from: window.from, to: window.to })),
    weekdaysUtc: [...table.peak.weekdaysUtc],
    ...(offPeakHalf === undefined ? {} : { offPeakHalf }),
    version: table.version,
    source: table.sourceUrl
  }
}

/**
 * Resolve one peak-definition request into a response.
 * @param req - the HTTP request.
 * @param priceTable - the price-table loader.
 * @returns the status and JSON body to answer with.
 */
function resolvePeakRequest(req, priceTable) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return { status: 405, body: { error: 'method-not-allowed' } }
  try {
    return { status: 200, body: peakDefinition(priceTable.get()) }
  } catch (error) {
    return { status: 500, body: { error: 'internal', message: String(error?.message ?? error) } }
  }
}

/**
 * Resolve one tree request into a response, without touching the socket.
 * @param req - the HTTP request.
 * @param reader - the tree reader.
 * @returns the status and JSON body to answer with.
 */
function resolveTreeRequest(req, reader) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return { status: 405, body: { error: 'method-not-allowed' } }
  let sessionId
  try {
    sessionId = new URL(req.url ?? '/', 'http://dsh.invalid').searchParams.get('session') ?? ''
  } catch {
    return { status: 400, body: { error: 'bad-request' } }
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(sessionId)) return { status: 400, body: { error: 'bad-session' } }
  try {
    return { status: 200, body: reader.subtree(sessionId) }
  } catch (error) {
    return { status: 500, body: { error: 'internal', message: String(error?.message ?? error) } }
  }
}

/**
 * Register the `sessionCost` unit and, where the web carrier exists, the route
 * the browser reads the session-**tree** figure from. Both are effects on this
 * plugin's fiber, so unloading removes the key, the route, and every cache with
 * them.
 * @param ctx - registrant context carrying the projection registry.
 */
function apply(ctx) {
  const priceTable = createPriceTableLoader(PRICE_FILE, ctx.logger)
  const definition = createDefinition(priceTable)
  ctx.sessionProjections.register(definition)

  const reader = createTreeReader({
    sessionsRoot: join(resolveHarnessHome(), 'sessions'),
    // The tree folds every log through the very unit the projection uses, so a
    // session's contribution to the tree is its own projection value.
    fold: (events, header) => {
      let state = definition.init(header ?? { version: 3, id: 'unknown', createdAt: 0, isSeeded: false }, 0)
      for (const event of events) state = definition.apply(state, event)
      return definition.wire.view(state)
    },
    // A live session's log may trail its in-memory state, and its cells are
    // already folded: prefer the registry wherever the session is attached.
    liveCost: (id) => {
      const sessions = ctx.get('sessions')
      const session = sessions?.get?.(id)
      if (session === undefined) return undefined
      try {
        return ctx.sessionProjections.snapshot(session, [PROJECTION_KEY]).values[PROJECTION_KEY]
      } catch {
        return undefined
      }
    },
    logger: ctx.logger
  })

  const balance = createBalanceReader(ctx)

  // The web carrier is a later row than this one on the Web surface and absent
  // on the other surfaces, so the routes wait for it instead of being skipped:
  // `ctx.get` here would answer undefined during this fiber's own activation.
  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    /** Last answer, so a burst of client reads folds once. */
    let cached
    const respond = (res, req, answer) => {
      const payload = JSON.stringify(answer.body)
      res.writeHead(answer.status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(payload),
        'cache-control': 'no-store'
      })
      res.end(req.method === 'HEAD' ? undefined : payload)
    }
    webCtx.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: TREE_PATH,
          handler: (req, res) => {
            const key = req.url ?? ''
            const now = Date.now()
            let answer = cached !== undefined && cached.key === key && now - cached.at < TREE_TTL_MS ? cached.answer : undefined
            if (answer === undefined) {
              answer = resolveTreeRequest(req, reader)
              cached = { key, at: now, answer }
            }
            respond(res, req, answer)
          }
        }),
      'session-cost: tree route'
    )
    // The peak definition is a constant of the price table, so its answer is not
    // cached here: the loader already holds the file's mtime-keyed table.
    webCtx.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: PEAK_PATH,
          handler: (req, res) => respond(res, req, resolvePeakRequest(req, priceTable))
        }),
      'session-cost: peak route'
    )
    // The balance is read from the provider, so the handler is asynchronous and
    // its own reader holds the TTL: one provider call per minute, not per page.
    webCtx.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: BALANCE_PATH,
          handler: async (req, res) => respond(res, req, await resolveBalanceRequest(req, balance))
        }),
      'session-cost: balance route'
    )
  })
}

export { apply, inject, name, PROJECTION_KEY as key, TREE_PATH, BALANCE_PATH, resolveHarnessHome }
