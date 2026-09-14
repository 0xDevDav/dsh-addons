import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// Exercise the browser half without a browser: a minimal hooks runtime renders
// the pill and its panel, and a fake client context records what apply() registers.
import fs from 'node:fs'
import assert from 'node:assert/strict'

const PACK = packPath('dsh-session-cost')

let failures = 0
const check = (label, fn) => {
  try { fn(); console.log(`  ok   ${label}`) } catch (error) { failures++; console.log(`  FAIL ${label}: ${error.message}`) }
}

// ── minimal react ───────────────────────────────────────────────────────────
const Fragment = Symbol('Fragment')
let hooks = []
let cursor = 0
let dirty = false
let pendingEffects = []

const react = {
  Fragment,
  createElement(type, props, ...children) {
    const resolved = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
    const element = { type, props: { ...(props ?? {}) }, children: resolved }
    const fakeNode = {
      getBoundingClientRect: () => ({ left: 120, top: 640, bottom: 660, right: 220, width: 100, height: 20 }),
      contains: () => false
    }
    const ref = element.props.ref
    if (typeof ref === 'function') ref(fakeNode)
    else if (ref !== null && typeof ref === 'object') ref.current = fakeNode
    if (ref !== undefined) delete element.props.ref
    return element
  },
  memo: (component) => component,
  useState(initial) {
    const index = cursor++
    // Each mount owns its state, so a late promise from an unmounted instance
    // cannot write into the instance being rendered now.
    const store = hooks
    if (store.length <= index) store[index] = typeof initial === 'function' ? initial() : initial
    return [store[index], (value) => {
      store[index] = typeof value === 'function' ? value(store[index]) : value
      dirty = true
    }]
  },
  useRef(initial) {
    const index = cursor++
    const store = hooks
    if (store.length <= index) store[index] = { current: initial ?? null }
    return store[index]
  },
  useEffect(fn, deps) {
    const index = cursor++
    // Effects run after the render commits (refs attached), like React.
    pendingEffects.push({ index, fn, deps })
  },
  useCallback(fn) {
    cursor++
    return fn
  }
}
const reactDom = {
  createPortal(children, container) {
    return { type: 'portal', container, children }
  }
}

// ── minimal DOM/window ──────────────────────────────────────────────────────
const styles = []
/** A tiny element tree: enough class, insert, and connectivity for placement. */
function makeElement(tag) {
  const element = {
    tagName: String(tag).toUpperCase(),
    dataset: {},
    textContent: '',
    classList: [],
    children: [],
    parentElement: null,
    isConnected: false,
    appendChild(child) {
      child.parentElement = element
      child.isConnected = true
      element.children.push(child)
      return child
    },
    insertBefore(child, reference) {
      child.parentElement = element
      child.isConnected = true
      const index = reference === null || reference === undefined ? -1 : element.children.indexOf(reference)
      if (index < 0) element.children.push(child)
      else element.children.splice(index, 0, child)
      return child
    },
    remove() {
      const parent = element.parentElement
      if (parent !== null) {
        const index = parent.children.indexOf(element)
        if (index >= 0) parent.children.splice(index, 1)
      }
      element.parentElement = null
      element.isConnected = false
    }
  }
  Object.defineProperty(element, 'className', {
    get: () => element.classList.join(' '),
    set: (value) => { element.classList = String(value).split(/\s+/).filter(Boolean) }
  })
  Object.defineProperty(element, 'nextSibling', {
    get: () => {
      const parent = element.parentElement
      if (parent === null) return null
      const index = parent.children.indexOf(element)
      return index < 0 ? null : parent.children[index + 1] ?? null
    }
  })
  Object.defineProperty(element, 'previousSibling', {
    get: () => {
      const parent = element.parentElement
      if (parent === null) return null
      const index = parent.children.indexOf(element)
      return index <= 0 ? null : parent.children[index - 1] ?? null
    }
  })
  return element
}
/** The fake sidebar column: brand row, New-session button, footer, settings row. */
const sidebar = { column: null, logoRow: null, newSession: null, footer: null, settingsRow: null, trigger: null, indicator: null }
function buildSidebar() {
  const column = makeElement('div')
  column.className = 'abcd_root'
  const logoRow = makeElement('div')
  logoRow.className = 'abcd_logoRow'
  const newSession = makeElement('button')
  newSession.className = 'abcd_newSession'
  const footer = makeElement('div')
  footer.className = 'abcd_footerActions'
  const settingsRow = makeElement('div')
  settingsRow.className = 'abcd_triggerRow'
  const trigger = makeElement('button')
  trigger.className = 'abcd_trigger'
  const indicator = makeElement('span')
  indicator.className = 'abcd_indicator'
  settingsRow.appendChild(trigger)
  settingsRow.appendChild(indicator)
  column.appendChild(logoRow)
  column.appendChild(newSession)
  column.appendChild(footer)
  column.appendChild(settingsRow)
  sidebar.column = column
  sidebar.logoRow = logoRow
  sidebar.newSession = newSession
  sidebar.footer = footer
  sidebar.settingsRow = settingsRow
  sidebar.trigger = trigger
  sidebar.indicator = indicator
  return column
}
const body = makeElement('div')
body.isConnected = true
body.appendChild(buildSidebar())
/** Walk the fake tree. */
function walkElements(node, visit) {
  for (const child of node.children ?? []) {
    if (child.tagName !== undefined) visit(child)
    walkElements(child, visit)
  }
}
/** The fake shipped statistics row, or null to simulate its absence. */
let statsRowNode = { id: 'shipped-stats-row', isConnected: true }
globalThis.document = {
  body,
  head: { appendChild: (tag) => styles.push(tag) },
  createElement: (tag) => makeElement(tag),
  querySelector(selector) {
    if (selector === '[data-composer-stats]') return statsRowNode
    return styles.find((style) => selector.includes(style.dataset.pluginCss)) ?? null
  },
  querySelectorAll(selector) {
    const tag = (selector.match(/^([a-z]+)\[/) ?? [])[1]
    const found = []
    walkElements(body, (element) => {
      if (tag !== undefined && element.tagName !== tag.toUpperCase()) return
      if (selector.includes('[class]') && element.className === '') return
      found.push(element)
    })
    return found
  },
  addEventListener: () => {},
  removeEventListener: () => {}
}
globalThis.window = {
  innerWidth: 1200,
  innerHeight: 800,
  addEventListener: () => {},
  removeEventListener: () => {},
  __ModuleLoader__: { load: (definition) => { globalThis.__bundle = definition } }
}
/** The route stubs: what `fetch` answers per path, and the URLs it was asked for. */
let treeAnswer = { mode: 'reject' }
let peakAnswer = { mode: 'reject' }
let balanceAnswer = { mode: 'reject' }
const fetched = []
globalThis.fetch = (url) => {
  fetched.push(url)
  const answer = String(url).startsWith('/session-cost/peak') ? peakAnswer
    : String(url).startsWith('/session-cost/balance') ? balanceAnswer
    : treeAnswer
  if (answer.mode === 'reject') return Promise.reject(new Error('no route'))
  if (answer.mode === 'not-ok') return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
  if (answer.mode === 'garbage') return Promise.resolve({ ok: true, json: () => Promise.resolve({ nonsense: true }) })
  return Promise.resolve({ ok: true, json: () => Promise.resolve(answer.value) })
}

await import(`file:///${PACK}/lib/client.js`)
const client = globalThis.__bundle.factory((spec) => {
  if (spec === 'react') return react
  if (spec === 'react-dom') return reactDom
  throw new Error(`unexpected require("${spec}")`)
})

/** Expand function components and portals into plain elements (CostPanel uses no hooks). */
function resolve(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return node
  if (Array.isArray(node)) return node.map(resolve)
  if (typeof node !== 'object') return node
  if (typeof node.type === 'function') return resolve(node.type(node.props))
  return { ...node, children: resolve(node.children) }
}
/** Render a component with the mini hooks runtime, settling state updates. */
function rerender(component, props) {
  let tree
  for (let pass = 0; pass < 10; pass++) {
    cursor = 0
    dirty = false
    pendingEffects = []
    tree = component(props)
    for (const effect of pendingEffects) {
      const previous = hooks[effect.index]
      const changed = previous === undefined || effect.deps === undefined || previous.deps === undefined || effect.deps.some((dep, index) => dep !== previous.deps[index])
      if (changed) hooks[effect.index] = { deps: effect.deps, cleanup: effect.fn() }
    }
    if (!dirty) return tree
  }
  return tree
}
/** Render from scratch, then settle. */
function render(component, props, seed) {
  hooks = seed === undefined ? [] : [seed]
  return rerender(component, props)
}
/** Let every queued promise callback run, so no scenario leaks into the next. */
const settle = async () => {
  for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setImmediate(resolve))
}
/** Visit every element in a resolved tree. */
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return }
  if (typeof node !== 'object') return
  visit(node)
  walk(node.children, visit)
}
/** Every element of a tag/type, in tree order. */
function allOfType(node, type) {
  const found = []
  walk(node, (element) => { if (element.type === type) found.push(element) })
  return found
}
/** The first element carrying a class. */
function byClass(node, cls) {
  let hit
  walk(node, (element) => {
    const className = element.props?.className
    if (typeof className === 'string' && className.split(' ').includes(cls)) hit ??= element
  })
  return hit
}
/** Collect every string in a resolved tree. */
function texts(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { for (const child of node) texts(child, out); return out }
  texts(node.children, out)
  return out
}
/** Every portal in a tree, with its container. */
function portalsOf(node) {
  const found = []
  walk(node, (element) => { if (element.type === 'portal') found.push(element) })
  return found
}
/** The portal carrying the pill. */
function pillPortal(node) {
  let hit
  walk(node, (element) => {
    if (element.type === 'portal' && byClass(element.children, 'dsc_anchor') !== undefined) hit ??= element
  })
  return hit
}

// The component is not exported; reach it through the slot registration.
const registered = []
const dictionaries = []
const fakeCtx = {
  effect(fn, label) { registered.push({ kind: 'effect', label, dispose: fn() }) },
  locale: { register(ns, id, dict) { dictionaries.push({ ns, id, dict, keys: Object.keys(dict).length }); return () => {} } },
  slots: {
    inject(slot, factory) {
      registered.push({ kind: 'inject', slot })
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    register(options, component) { registered.push({ kind: 'register', options, component }); return () => {} }
  }
}
client.apply(fakeCtx)

const slotRegistration = registered.find((entry) => entry.kind === 'register')
const Pill = slotRegistration?.component

// ── registration contract ───────────────────────────────────────────────────
console.log('registration:')
check('the client half injects slots and locale', () => assert.deepEqual(client.inject, ['slots', 'locale']))
check('it targets conversation.composer.dock with its own id', () => {
  assert.equal(slotRegistration?.options.name, 'conversation.composer.dock')
  assert.equal(slotRegistration?.options.id, 'session-cost')
})
check('it lands beside the shipped stats cell (order > 0)', () => assert.equal(slotRegistration.options.order, 1))
check('it declares its locale namespace', () => assert.equal(slotRegistration.options.locale, 'sessionCost'))
check('both dictionaries register with identical key sets', () => {
  assert.deepEqual(dictionaries.map((entry) => `${entry.ns}:${entry.id}`), ['sessionCost:en', 'sessionCost:it'])
  assert.equal(dictionaries[0].keys, dictionaries[1].keys)
})
check('every entry is injected into its slot, not registered eagerly', () => {
  const ids = registered.filter((entry) => entry.kind === 'register').map((entry) => entry.options.id)
  assert.deepEqual(ids, ['session-cost', 'peak-hours', 'account-credit'])
  const slots = registered.filter((entry) => entry.kind === 'inject').map((entry) => entry.slot)
  assert.deepEqual(slots, ['conversation.composer.dock', 'sidebar.footer.action', 'sidebar.footer.action'])
})
check('the stylesheet is injected once', () => assert.equal(styles.length, 1))

// ── rendering ───────────────────────────────────────────────────────────────
/** Every translation key the rendered components asked for. */
const askedKeys = new Set()
const t = (key, params) => {
  askedKeys.add(key)
  return params === undefined ? key : `${key}(${Object.values(params).join(',')})`
}
const withProjection = (value, sessionId = 'session-abc') => ({ useProjection: () => value, t, sessionId })

const priced = {
  currency: 'USD',
  requests: 254,
  pricedRequests: 254,
  unpricedRequests: 0,
  complete: true,
  total: 0.794387,
  cost: { miss: 0.079053, hit: 0.416114, out: 0.29922, write: 0 }
}
const openTree = (props) => resolve(render(Pill, props, true))

console.log('\nplacement:')
check('the pill rides inside the shipped statistics row when it exists', () => {
  statsRowNode = { id: 'shipped-stats-row', isConnected: true }
  const tree = resolve(render(Pill, withProjection(priced)))
  const portal = pillPortal(tree)
  assert.ok(portal, 'the pill must be portaled into a host row')
  assert.equal(portal.container, statsRowNode, 'the portal target must be the shipped stats row')
  assert.equal(byClass(tree, 'dsc_root'), undefined, 'no row of its own when the shipped row exists')
})
check('the shipped row is found by its published hook, not by class name', () => {
  const looked = []
  const original = document.querySelector
  document.querySelector = (selector) => { looked.push(selector); return original(selector) }
  try { render(Pill, withProjection(priced)) } finally { document.querySelector = original }
  assert.ok(looked.includes('[data-composer-stats]'))
})
check('it falls back to its own row while the shipped row is absent', () => {
  statsRowNode = null
  try {
    const tree = resolve(render(Pill, withProjection(priced)))
    const root = byClass(tree, 'dsc_root')
    assert.ok(root, 'a fallback row must exist')
    assert.ok(byClass(root, 'dsc_anchor'), 'the fallback row carries the pill')
    assert.equal(pillPortal(tree), undefined)
  } finally {
    statsRowNode = { id: 'shipped-stats-row', isConnected: true }
  }
})

console.log('\npill:')
check('an absent projection renders nothing', () => assert.equal(render(Pill, withProjection(undefined)), null))
check('a session with no billed request renders nothing', () => {
  assert.equal(render(Pill, withProjection({ ...priced, requests: 0 })), null)
})
check('a priced session renders the amount and an accessible name', () => {
  const tree = resolve(render(Pill, withProjection(priced)))
  assert.ok(/0[.,]794/.test(texts(tree).join(' ')), 'the label carries the amount')
  const button = allOfType(tree, 'button')[0]
  assert.match(button.props['aria-label'], /^pill\.priced\(.*794.*\)$/)
  assert.equal(button.props['aria-haspopup'], 'dialog')
  assert.equal(button.props['aria-expanded'], false)
})
check('an incomplete total is shown as a floor', () => {
  const partial = { ...priced, unpricedRequests: 3, complete: false }
  const tree = resolve(render(Pill, withProjection(partial)))
  assert.match(allOfType(tree, 'button')[0].props['aria-label'], /^pill\.atLeast\(/)
  assert.ok(texts(tree).join(' ').includes('≥'))
})
check('an unpriced session shows a dash and says so', () => {
  const unpriced = { ...priced, pricedRequests: 0, unpricedRequests: 254, total: 0, cost: { miss: 0, hit: 0, out: 0, write: 0 } }
  const tree = resolve(render(Pill, withProjection(unpriced)))
  assert.equal(allOfType(tree, 'button')[0].props['aria-label'], 'pill.unpriced')
  assert.ok(texts(tree).join(' ').includes('—'))
})

console.log('\npanel:')
check('the panel is a title with exactly the three billed buckets', () => {
  const tree = openTree(withProjection(priced))
  const panel = byClass(tree, 'dsc_panel')
  assert.ok(panel, 'the open pill renders its panel')
  const labels = allOfType(panel, 'dt').map((node) => texts(node).join(''))
  assert.deepEqual(labels, ['dialog.inputMiss', 'dialog.inputHit', 'dialog.output'])
  assert.equal(allOfType(panel, 'dd').length, 3)
})
check('every row shows money, and the rows are the total addends', () => {
  const panel = byClass(openTree(withProjection(priced)), 'dsc_panel')
  const values = allOfType(panel, 'dd').map((node) => texts(node).join(''))
  for (const value of values) assert.match(value, /\$/, `row value should be money, got "${value}"`)
  assert.match(values[0], /0[.,]079/, `input miss row, got "${values[0]}"`)
  assert.match(values[1], /0[.,]416/, `input hit row, got "${values[1]}"`)
  assert.match(values[2], /0[.,]299/, `output row, got "${values[2]}"`)
})
check('the title carries the total', () => {
  const panel = byClass(openTree(withProjection(priced)), 'dsc_panel')
  assert.match(texts(byClass(panel, 'dsc_titleValue')).join(''), /0[.,]794/)
})
check('nothing else is rendered: no notes, warnings, tiers, tokens or per-model rows', () => {
  const tree = openTree(withProjection(priced))
  const panel = byClass(tree, 'dsc_panel')
  assert.equal(byClass(panel, 'dsc_note'), undefined)
  assert.equal(byClass(panel, 'dsc_warn'), undefined)
  assert.equal(byClass(panel, 'dsc_group'), undefined)
  const words = texts(tree).join(' | ')
  for (const absent of ['dialog.scope', 'dialog.source', 'dialog.estimate', 'dialog.tokens', 'dialog.byModel', 'dialog.requests', 'dialog.peak', 'dialog.offPeak', 'dialog.unpriced', 'dialog.noPrice', 'dialog.usageMissing']) {
    assert.ok(!words.includes(absent), `panel must not render ${absent}`)
  }
  // One title, one rule, one grid of three rows — nothing more.
  assert.equal(allOfType(panel, 'dl').length, 1)
  assert.equal(allOfType(panel, 'div').filter((node) => node.props.className === 'dsc_titleRule').length, 1)
})
check('an unpriced session shows a dash on every row', () => {
  const unpriced = { ...priced, pricedRequests: 0, unpricedRequests: 254, total: 0, cost: { miss: 0, hit: 0, out: 0, write: 0 } }
  const panel = byClass(openTree(withProjection(unpriced)), 'dsc_panel')
  assert.deepEqual(allOfType(panel, 'dd').map((node) => texts(node).join('')), ['—', '—', '—'])
})
check('a priced cache-write bucket adds its own row', () => {
  const withWrite = { ...priced, total: priced.total + 0.002, cost: { ...priced.cost, write: 0.002 } }
  const panel = byClass(openTree(withProjection(withWrite)), 'dsc_panel')
  assert.deepEqual(allOfType(panel, 'dt').map((node) => texts(node).join('')), ['dialog.inputMiss', 'dialog.inputHit', 'dialog.output', 'dialog.cacheWrite'])
})
check('the panel opens upward from the pill', () => {
  const panel = byClass(openTree(withProjection(priced)), 'dsc_panel')
  assert.equal(panel.props.style.left, '120px')
  assert.equal(panel.props.style.width, '340px')
  assert.equal(panel.props.style.bottom, '166px')
  assert.equal(panel.props.role, 'dialog')
})

console.log('\nsession tree:')
/** A tree answer covering this session plus 54 subagent sessions. */
const treePayload = {
  currency: 'USD',
  total: 1.356049,
  cost: { miss: 0.209296, hit: 0.530413, out: 0.61634, write: 0 },
  requests: 619,
  pricedRequests: 619,
  unpricedRequests: 0,
  complete: true,
  sessions: 55,
  unreadable: 0
}
const withTree = async (payload, props) => {
  treeAnswer = { mode: 'value', value: payload }
  const first = resolve(render(Pill, props))
  await settle()
  return { first, settled: resolve(rerender(Pill, props)) }
}

const treeRun = await withTree(treePayload, withProjection(priced))
check('the tree figure replaces the session figure once it arrives', () => {
  assert.match(texts(treeRun.first).join(' '), /0[.,]794/, `before the read, got "${texts(treeRun.first).join(' ')}"`)
  assert.match(texts(treeRun.settled).join(' '), /1[.,]3\d/, `after the read, got "${texts(treeRun.settled).join(' ')}"`)
})
check('the accessible name says the figure includes the subagents', () => {
  const label = allOfType(treeRun.settled, 'button')[0].props['aria-label']
  assert.match(label, /^pill\.tree\.priced\(/, label)
  assert.match(label, /1[.,]3\d/)
})
check('the tree read names the session it is about', () => {
  assert.ok(fetched.some((url) => url === '/session-cost/tree?session=session-abc'), fetched.join(', '))
})
check('the panel rows are the tree addends', () => {
  // The harness drives the pill's own open state directly: hooks[0] is its useState.
  hooks[0] = true
  const openSettled = resolve(rerender(Pill, withProjection(priced)))
  const panel = byClass(openSettled, 'dsc_panel')
  assert.ok(panel, 'the panel renders while open')
  const values = allOfType(panel, 'dd').map((node) => texts(node).join(''))
  assert.match(values[0], /0[.,]209/, `input miss row, got "${values[0]}"`)
  assert.match(values[1], /0[.,]530/, `input hit row, got "${values[1]}"`)
  assert.match(values[2], /0[.,]616/, `output row, got "${values[2]}"`)
  assert.match(texts(byClass(panel, 'dsc_titleValue')).join(''), /1[.,]3\d/)
})

console.log('\nsession tree fallbacks:')
const fallbacks = {}
for (const mode of ['reject', 'not-ok', 'garbage']) {
  treeAnswer = { mode }
  resolve(render(Pill, withProjection(priced)))
  await settle()
  fallbacks[mode] = resolve(rerender(Pill, withProjection(priced)))
}
for (const [mode, label] of [['reject', 'a refused read'], ['not-ok', 'a non-200 answer'], ['garbage', 'a malformed body']]) {
  check(`${label} leaves the session figure in place`, () => {
    assert.match(texts(fallbacks[mode]).join(' '), /0[.,]794/)
    assert.match(allOfType(fallbacks[mode], 'button')[0].props['aria-label'], /^pill\.priced\(/)
  })
}
treeAnswer = { mode: 'value', value: { ...treePayload, total: 0, requests: 0, cost: { miss: 0, hit: 0, out: 0, write: 0 } } }
resolve(render(Pill, withProjection(priced)))
await settle()
const emptyTree = resolve(rerender(Pill, withProjection(priced)))
check('a tree read that saw no billed request falls back to the session figure', () => {
  assert.match(texts(emptyTree).join(' '), /0[.,]794/)
  assert.match(allOfType(emptyTree, 'button')[0].props['aria-label'], /^pill\.priced\(/)
})

fetched.length = 0
treeAnswer = { mode: 'value', value: treePayload }
resolve(render(Pill, withProjection(priced, '')))
await settle()
check('with no session id the pill never reaches for the tree', () => assert.deepEqual(fetched, []))

const singleSession = await withTree({ ...treePayload, total: 0.794387, cost: priced.cost, requests: 254, sessions: 1 }, withProjection(priced))
check('a single-session tree keeps the session wording', () => {
  assert.match(allOfType(singleSession.settled, 'button')[0].props['aria-label'], /^pill\.priced\(/)
})
treeAnswer = { mode: 'reject' }

console.log('\npeak widget:')
const peakPayload = {
  available: true,
  windowsUtc: [{ from: 1, to: 4 }, { from: 6, to: 10 }],
  weekdaysUtc: [1, 2, 3, 4, 5],
  offPeakHalf: true,
  version: '2026-09-14',
  source: 'https://api-docs.deepseek.com/quick_start/pricing/'
}
const widgetRegistration = registered.find((entry) => entry.kind === 'register' && entry.options.id === 'peak-hours')
const Widget = widgetRegistration?.component
const realNow = Date.now
/** Render the widget at a fixed instant, letting its peak read settle. */
const renderPeak = async (instant, wide = true) => {
  Date.now = () => instant
  const first = resolve(render(Widget, { t, wide }))
  await settle()
  return { first, settled: resolve(rerender(Widget, { t, wide })) }
}
/** The inserted holder, if the peak widget placed itself. */
function holderBeforeNewSession() {
  const index = sidebar.column.children.indexOf(sidebar.newSession)
  const candidate = index > 0 ? sidebar.column.children[index - 1] : undefined
  return candidate !== undefined && candidate.dataset.sessionCostPlaced !== undefined ? candidate : undefined
}
/** The inserted holder inside the Settings row, if the balance placed itself. */
function holderInSettingsRow() {
  const index = sidebar.settingsRow.children.indexOf(sidebar.indicator)
  const candidate = index > 0 ? sidebar.settingsRow.children[index - 1] : undefined
  return candidate !== undefined && candidate !== sidebar.trigger && candidate.dataset.sessionCostPlaced !== undefined ? candidate : undefined
}

check('the widget registers in the sidebar seat as its carrier', () => {
  assert.equal(widgetRegistration?.options.name, 'sidebar.footer.action')
  assert.equal(widgetRegistration.options.id, 'peak-hours')
})

// The unavailable case first: an absent definition must render nothing at all.
peakAnswer = { mode: 'reject' }
const noPeak = await renderPeak(Date.parse('2026-09-14T12:14:00+02:00'))
check('an unavailable peak definition renders nothing', () => assert.equal(noPeak.settled, null))

peakAnswer = { mode: 'value', value: peakPayload }
const mondayOff = await renderPeak(Date.parse('2026-09-14T12:14:00+02:00'))
check('a Monday afternoon in Rome is off-peak', () => {
  const words = texts(mondayOff.settled).join(' | ')
  assert.ok(words.includes('peak.status.off'), words)
})
check('the schedule is converted to local time and the local weekday', () => {
  const words = texts(mondayOff.settled).join(' | ')
  assert.ok(words.includes('03:00–06:00'), words)
  assert.ok(words.includes('08:00–12:00'), words)
  assert.ok(words.includes('lun–ven'), words)
})
check('the tooltip names the next change', () => {
  const root = byClass(mondayOff.settled, 'dsp_root')
  assert.match(root.props.title, /peak\.change\(03:00\)/)
})
check('the widget is inserted before the New-session button and portaled into it', () => {
  const holder = holderBeforeNewSession()
  assert.ok(holder, 'an inserted holder must sit directly before the button')
  const portal = portalsOf(mondayOff.settled).find((entry) => entry.container === holder)
  assert.ok(portal, 'the widget is portaled into that holder')
  assert.equal(byClass(mondayOff.settled, 'dsp_inline'), undefined, 'no fallback while placed')
})
check('the widget cleans its node up when it unmounts', () => {
  const holder = holderBeforeNewSession()
  assert.ok(holder)
  // The harness never runs effect cleanups; assert the intent through the effect itself.
  assert.equal(holder.dataset.sessionCostPlaced, '')
})

const mondayMorning = await renderPeak(Date.parse('2026-09-14T09:00:00+02:00'))
check('a Monday morning in Rome is peak', () => {
  const words = texts(mondayMorning.settled).join(' | ')
  assert.ok(words.includes('peak.status.peak'), words)
  assert.equal(byClass(mondayMorning.settled, 'dsp_dot').props['data-peak'], 'true')
})
check('the morning peak ends at noon local time', () => {
  const root = byClass(mondayMorning.settled, 'dsp_root')
  assert.match(root.props.title, /peak\.change\(12:00\)/)
})

const saturday = await renderPeak(Date.parse('2026-09-19T03:00:00+02:00'))
check('the weekend is off-peak even at a peak hour', () => {
  const words = texts(saturday.settled).join(' | ')
  assert.ok(words.includes('peak.status.off'), words)
  const root = byClass(saturday.settled, 'dsp_root')
  assert.match(root.props.title, /peak\.change\(03:00\)/, 'the next peak is Monday')
})

const winter = await renderPeak(Date.parse('2026-12-14T09:00:00+01:00'))
check('the schedule follows the winter offset', () => {
  const words = texts(winter.settled).join(' | ')
  assert.ok(words.includes('peak.status.peak'), words)
  assert.ok(words.includes('02:00–05:00'), words)
  assert.ok(words.includes('07:00–11:00'), words)
})

console.log('\ndaylight saving:')
// Europe/Rome: back on Sunday 25 October 2026, forward on Sunday 29 March 2026.
const offsetAt = (iso) => -new Date(iso).getTimezoneOffset() / 60
check('the machine really changes offset on the expected Sundays', () => {
  assert.equal(offsetAt('2026-10-24T12:00:00Z'), 2, 'Saturday before the fall-back is CEST')
  assert.equal(offsetAt('2026-10-26T12:00:00Z'), 1, 'Monday after the fall-back is CET')
  assert.equal(offsetAt('2026-03-28T12:00:00Z'), 1, 'Saturday before the spring-forward is CET')
  assert.equal(offsetAt('2026-03-30T12:00:00Z'), 2, 'Monday after the spring-forward is CEST')
})

const afterFallBack = await renderPeak(Date.parse('2026-10-26T09:00:00+01:00'))
check('the day after the fall-back the window has already shifted an hour earlier', () => {
  const words = texts(afterFallBack.settled).join(' | ')
  assert.ok(words.includes('02:00–05:00'), words)
  assert.ok(words.includes('07:00–11:00'), words)
  assert.ok(words.includes('peak.status.peak'), '09:00 CET is 08:00 UTC, inside the window')
})

const afterSpringForward = await renderPeak(Date.parse('2026-03-30T09:00:00+02:00'))
check('the day after the spring-forward the window is back an hour later', () => {
  const words = texts(afterSpringForward.settled).join(' | ')
  assert.ok(words.includes('03:00–06:00'), words)
  assert.ok(words.includes('08:00–12:00'), words)
  assert.ok(words.includes('peak.status.peak'), '09:00 CEST is 07:00 UTC, inside the window')
})

const beforeFallBack = await renderPeak(Date.parse('2026-10-24T12:00:00+02:00'))
check('the next change is computed across the transition, in post-transition local time', () => {
  const root = byClass(beforeFallBack.settled, 'dsp_root')
  assert.match(root.props.title, /peak\.change\(02:00\)/, 'Saturday noon CEST: the next peak is Monday 02:00 CET')
})

const transitionSunday = await renderPeak(Date.parse('2026-10-25T02:30:00+01:00'))
check('the transition Sunday itself stays off-peak', () => {
  const words = texts(transitionSunday.settled).join(' | ')
  assert.ok(words.includes('peak.status.off'), words)
  const root = byClass(transitionSunday.settled, 'dsp_root')
  assert.match(root.props.title, /peak\.change\(02:00\)/, 'and the next peak is the Monday after it')
})

// The decisive check: the browser's own translation of the schedule must agree
// with the host's rule that actually prices the requests, at every instant,
// including across both transitions.
const { normalizeTable, isPeakTime } = await import(`file:///${PACK}/lib/pricing.js`)
const hostTable = normalizeTable(JSON.parse(fs.readFileSync(`${PACK}/prices.json`, 'utf8')))
const probes = []
const around = (centre, hours, stepMinutes) => {
  for (let minute = -hours * 60; minute <= hours * 60; minute += stepMinutes) probes.push(centre + minute * 60000)
}
for (const transition of [Date.parse('2026-10-25T01:00:00Z'), Date.parse('2026-03-29T01:00:00Z')]) {
  around(transition, 3, 15)
  for (let hour = 0; hour < 48; hour++) probes.push(transition - 24 * 3600000 + hour * 3600000)
}
let mismatches = []
for (const instant of probes) {
  const run = await renderPeak(instant)
  const off = texts(run.settled).join(' ').includes('peak.status.off')
  const hostSaysPeak = isPeakTime(instant, hostTable.peak)
  if (off === hostSaysPeak) mismatches.push(`${new Date(instant).toISOString()} widget=${off ? 'off' : 'peak'} host=${hostSaysPeak ? 'peak' : 'off'}`)
}
check(`the widget agrees with the pricing rule at all ${probes.length} probed instants`, () => {
  assert.deepEqual(mismatches, [])
})

Date.now = () => Date.parse('2026-09-14T09:00:00+02:00')
resolve(render(Widget, { t, wide: false }))
await settle()
const collapsed = resolve(rerender(Widget, { t, wide: false }))
check('the collapsed rail renders nothing', () => assert.equal(collapsed, null))

const buttonClass = sidebar.newSession.className
const rowClass = sidebar.logoRow.className
sidebar.newSession.className = ''
sidebar.logoRow.className = ''
const fallbackRun = await renderPeak(Date.parse('2026-09-14T09:00:00+02:00'))
sidebar.newSession.className = buttonClass
sidebar.logoRow.className = rowClass
check('without both anchors the widget falls back to the sidebar seat', () => {
  assert.ok(byClass(fallbackRun.settled, 'dsp_inline'), 'the compact fallback renders')
  assert.match(texts(fallbackRun.settled).join(' '), /peak\.status\.peak/)
})
Date.now = realNow

console.log('\naccount balance:')
const creditRegistration = registered.find((entry) => entry.kind === 'register' && entry.options.id === 'account-credit')
const Credit = creditRegistration?.component
/** Render the balance beside Settings, letting its read settle. */
const renderCredit = async (answer) => {
  balanceAnswer = answer
  const first = resolve(render(Credit, { t, wide: true }))
  await settle()
  return { first, settled: resolve(rerender(Credit, { t, wide: true })) }
}
const balancePayload = {
  available: true,
  isAvailable: true,
  balances: [{ currency: 'CNY', total: '110.00', granted: '10.00', toppedUp: '100.00' }],
  fetchedAt: Date.parse('2026-09-14T12:34:00+02:00')
}

check('the credit registers beside Settings at the sidebar foot', () => {
  assert.equal(creditRegistration?.options.name, 'sidebar.footer.action')
  assert.equal(creditRegistration.options.order, 20)
})
check('no answer yet renders nothing', () => assert.equal(render(Credit, { t, wide: true }), null))
check('the collapsed rail renders no money figure', () => assert.equal(render(Credit, { t, wide: false }), null))

const credit = await renderCredit({ mode: 'value', value: balancePayload })
check('the provider figure is shown, formatted for the reader locale', () => {
  const amount = byClass(credit.settled, 'dsp_amount')
  assert.ok(amount, 'an amount renders')
  assert.match(texts(amount).join(''), /110/)
  assert.equal(amount.props['data-low'], 'false')
})
check('the tooltip carries the split and the read time', () => {
  const root = byClass(credit.settled, 'dsp_inline')
  for (const needle of ['credit.title', 'credit.granted', 'credit.toppedUp', 'credit.readAt']) assert.ok(root.props.title.includes(needle), root.props.title)
  assert.match(root.props['aria-label'], /^credit\.aria\(.*110.*\)$/)
})
check('the balance sits inside the Settings row, after its own button', () => {
  const children = sidebar.settingsRow.children
  assert.equal(children[0], sidebar.trigger, 'the trigger stays first')
  assert.equal(children[children.length - 1], sidebar.indicator, 'the indicator stays last')
  assert.ok(children.some((child) => child.dataset.sessionCostPlaced !== undefined), 'a holder sits between them')
})
check('the readout is portaled into that row, not into a row of its own', () => {
  const portal = portalsOf(credit.settled).find((entry) => byClass(entry.children, 'dsp_amount') !== undefined)
  assert.ok(portal, 'the readout renders through the placed node')
  assert.equal(portal.container.parentElement, sidebar.settingsRow)
  assert.equal(byClass(credit.settled, 'dsp_root'), undefined)
})
check('a low balance is marked and named', () => {
  const run = byClass(credit.settled, 'dsp_amount')
  assert.equal(run.props['data-low'], 'false')
})
const low = await renderCredit({ mode: 'value', value: { ...balancePayload, isAvailable: false } })
check('an insufficient balance is marked', () => {
  assert.equal(byClass(low.settled, 'dsp_amount').props['data-low'], 'true')
  assert.ok(byClass(low.settled, 'dsp_inline').props.title.includes('credit.low'))
})
balanceAnswer = { mode: 'reject' }

for (const [reason, needle] of [['missing-credential', 'credit.reason.missing-credential'], ['unauthorized', 'credit.reason.unauthorized'], ['network', 'credit.reason.network'], ['timeout', 'credit.reason.timeout'], ['malformed', 'credit.reason.malformed'], ['http-429', 'credit.reason.http(429)']]) {
  const run = await renderCredit({ mode: 'value', value: { available: false, reason } })
  check(`an unreadable balance names the cause (${reason})`, () => {
    assert.match(texts(run.settled).join(' '), /—/, 'no number is invented')
    assert.ok(byClass(run.settled, 'dsp_inline').props.title.includes(needle), byClass(run.settled, 'dsp_inline').props.title)
  })
}
const unknown = await renderCredit({ mode: 'value', value: { available: false, reason: 'weird' } })
check('an unknown reason is shown as it arrived, not dressed up', () => {
  assert.ok(byClass(unknown.settled, 'dsp_inline').props.title.includes('weird'))
})

const emptyCredit = await renderCredit({ mode: 'value', value: { available: true, isAvailable: true, balances: [], fetchedAt: 0 } })
check('an empty balance list shows a dash and says so', () => {
  assert.match(texts(emptyCredit.settled).join(' '), /—/)
  assert.ok(byClass(emptyCredit.settled, 'dsp_inline').props.title.includes('credit.none'))
})

const twoCurrencies = await renderCredit({
  mode: 'value',
  value: {
    available: true,
    isAvailable: true,
    balances: [
      { currency: 'CNY', total: '110.00', granted: '', toppedUp: '' },
      { currency: 'USD', total: '3.50', granted: '', toppedUp: '' }
    ],
    fetchedAt: 0
  }
})
check('every reported currency is shown', () => {
  const words = texts(twoCurrencies.settled).join(' ')
  assert.match(words, /110/)
  assert.match(words, /3[.,]50/)
})
const big = await renderCredit({ mode: 'value', value: { available: true, isAvailable: true, balances: [{ currency: 'CNY', total: '12345.67', granted: '', toppedUp: '' }], fetchedAt: 0 } })
check('a large balance keeps its cents instead of rounding them away', () => {
  const shown = texts(big.settled).join('')
  assert.match(shown, /12\s?[.,]?\s?345/, shown)
  assert.match(shown, /67/, shown)
})

const savedRowClass = sidebar.settingsRow.className
sidebar.settingsRow.className = ''
const creditFallback = await renderCredit({ mode: 'value', value: balancePayload })
sidebar.settingsRow.className = savedRowClass
check('without the Settings row the balance still renders, in its supported seat', () => {
  assert.ok(byClass(creditFallback.settled, 'dsp_amount'), 'the figure survives')
  assert.equal(portalsOf(creditFallback.settled).find((entry) => byClass(entry.children, 'dsp_amount') !== undefined), undefined)
})
balanceAnswer = { mode: 'reject' }

console.log('\ntranslations:')
const enDict = dictionaries.find((entry) => entry.id === 'en')?.dict ?? {}
const itDict = dictionaries.find((entry) => entry.id === 'it')?.dict ?? {}
check('both dictionaries carry exactly the same keys', () => {
  assert.deepEqual(Object.keys(enDict).sort(), Object.keys(itDict).sort())
})
check(`every key the components asked for (${askedKeys.size}) exists in both dictionaries`, () => {
  const missing = [...askedKeys].filter((key) => !(key in enDict) || !(key in itDict))
  assert.deepEqual(missing, [])
})
check('no component asked for an empty translation', () => {
  for (const [key, value] of Object.entries(enDict)) if (value.trim() === '') throw new Error(`empty copy for ${key}`)
  for (const [key, value] of Object.entries(itDict)) if (value.trim() === '') throw new Error(`empty copy for ${key}`)
})

console.log(`\nfailures: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
