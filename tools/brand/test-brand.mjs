// Functional test of the DavCode identity pack's browser half: a minimal module loader,
// slot registry and DOM, then assertions on exactly what the pack contributes.
//
// The artwork assertions are deliberately literal: every coordinate, size, weight, tracking,
// anchor and colour below is the author's drawing, spelled out here so that a future edit
// cannot "improve" a position, a centring or a palette without failing this test. Both
// palettes are asserted, because the same drawing was supplied twice: once for the dark
// ground and once for the light one.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { packPath } from '../paths.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** The suite runs against the package in this repository, which is the source of truth. */
const PACK = path.resolve(HERE, '../../packages/dsh-brand-davcode')
/** …and, when the pack is installed, it checks the installed bundle is that same file. */
const INSTALLED = process.env.DSH_BRAND_PACK ?? packPath('dsh-brand-davcode')
const DARK = { accent: '#00FF9D', ink: '#F5F5F5', name: '#FFFFFF', badge: '#FFFFFF', label: '#000000' }
const LIGHT = { accent: '#009E60', ink: '#1A1A1A', name: '#1A1A1A', badge: '#1A1A1A', label: '#FFFFFF' }

// ── a DOM just large enough for this pack ───────────────────────────────────
class ClassList {
	constructor(names = []) { this.names = names }
	*[Symbol.iterator]() { yield* this.names }
	toArray() { return this.names }
}

class Element {
	constructor(tag, classes = [], options = {}) {
		this.tagName = tag.toUpperCase()
		this.classList = new ClassList(classes)
		this.children = []
		this.parentElement = null
		this.attributes = new Map()
		this.style = {}
		this.dataset = options.dataset ? { ...options.dataset } : {}
		this.rect = options.rect ?? { width: 400, height: 300 }
		this.removed = false
		for (const child of options.children ?? []) this.append(child)
	}
	append(child) { child.parentElement = this; this.children.push(child); return child }
	remove() {
		this.removed = true
		if (this.parentElement !== null) {
			const at = this.parentElement.children.indexOf(this)
			if (at >= 0) this.parentElement.children.splice(at, 1)
			this.parentElement = null
		}
	}
	contains(other) {
		let node = other
		while (node !== null && node !== undefined) {
			if (node === this) return true
			node = node.parentElement
		}
		return false
	}
	getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
	setAttribute(name, value) { this.attributes.set(name, String(value)) }
	removeAttribute(name) { this.attributes.delete(name) }
	getBoundingClientRect() { return this.rect }
	querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
	querySelectorAll(selector) {
		const found = []
		const visit = (node) => {
			for (const child of node.children) {
				if (matches(child, selector)) found.push(child)
				visit(child)
			}
		}
		visit(this)
		return found
	}
}

/** An attribute as a selector sees it; the class list is an attribute too. */
const attributeOf = (element, name) =>
	name === 'class' ? element.classList.toArray().join(' ') : element.getAttribute(name)

/** Enough selector engine for this pack: tag, `[attr]`, `[attr="v"]`, `[attr*="v"]`, `[attr~="v"]`. */
const matches = (element, selector) =>
	selector.split(',').some((raw) => {
		let part = raw.trim()
		const tag = /^([a-z]+)/.exec(part)
		if (tag) {
			if (element.tagName.toLowerCase() !== tag[1]) return false
			part = part.slice(tag[1].length)
		}
		const tests = [...part.matchAll(/\[([a-z-]+)(?:([*~]?)=["']([^"']*)["'])?\]/g)]
		if (tests.length === 0) return tag !== null
		return tests.every(([, name, operator, value]) => {
			const actual = attributeOf(element, name)
			if (actual === null) return false
			if (operator === undefined) return true
			if (operator === '*') return actual.includes(value)
			if (operator === '~') return actual.split(/\s+/).includes(value)
			return actual === value
		})
	})

// ── the fixture ─────────────────────────────────────────────────────────────
const lockupNode = new Element('svg')
lockupNode.setAttribute('data-dsh-brand', 'lockup')
const markSeat = new Element('span', ['hHd-Xa_brandMark'], { children: [new Element('svg')] })
const nameSeat = new Element('span', ['hHd-Xa_brandName'], { children: [lockupNode] })
const otherMarkSeat = new Element('span', ['hHd-Xa_brandMark'], { children: [new Element('svg')] })
const row = new Element('div', ['hHd-Xa_logoRow'], { children: [markSeat, nameSeat] })
const otherRow = new Element('div', ['hHd-Xa_logoRow'], { children: [otherMarkSeat] })

const titleElement = new Element('title')
const shippedIcon = new Element('link')
shippedIcon.setAttribute('rel', 'icon')
shippedIcon.setAttribute('href', './favicon.svg')
const body = new Element('body', [], { children: [row, otherRow] })
const head = new Element('head', [], { children: [titleElement, shippedIcon] })
const root = new Element('html', [], { children: [head, body] })

const documentStub = {
	body,
	documentElement: root,
	head,
	title: 'DeepSeek Harness',
	createElement(tag) { return new Element(tag) },
	querySelector: (selector) => (selector === 'title' ? titleElement : root.querySelector(selector)),
	querySelectorAll: (selector) => root.querySelectorAll(selector),
}
root.style.colorScheme = 'light'

const observers = []
globalThis.document = documentStub
globalThis.MutationObserver = class {
	constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this) }
	observe(target, options) { this.target = target; this.options = options }
	disconnect() { this.disconnected = true }
	fire() { this.callback([]) }
}

// ── the module loader, the slot registry and the effect scope ───────────────
let captured
globalThis.window = { __ModuleLoader__: { load(definition) { captured = definition } } }

const jsx = (type, props) => ({ type, props: props ?? {} })
/**
 * Just enough React for a one-shot render: state is read once and the effect runs
 * immediately, which is what these components need (they read the scheme into state and
 * subscribe to it). `currentScheme()` reads the root element, so a scheme flip is exercised
 * by re-rendering after the flip rather than by driving the setter.
 */
const hookCleanups = []
const reactStub = {
	useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
	useEffect(run) { hookCleanups.push(run()) },
}
const requireStub = (name) => {
	if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
	if (name === 'react') return reactStub
	throw new Error(`unexpected require: ${name}`)
}

await import(pathToFileURL(`${PACK}/lib/client.js`).href)

const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

check(captured !== undefined, 'the bundle never called window.__ModuleLoader__.load')
check(captured?.id === 'dsh-brand-davcode', `bundle id is "${captured?.id}"`)
const mod = captured.factory(requireStub)
check(Array.isArray(mod.inject) && mod.inject.includes('slots'), 'the pack must inject the slots service')

const registered = []
const disposed = []
const effects = []
/** `inject` keeps whatever disposes the contribution, draining a generator of them. */
const settle = (result) => {
	if (result !== null && typeof result === 'object' && typeof result.next === 'function') {
		const disposers = []
		for (let step = result.next(); !step.done; step = result.next()) {
			if (typeof step.value === 'function') disposers.push(step.value)
		}
		return () => { for (const dispose of disposers) dispose() }
	}
	return typeof result === 'function' ? result : () => {}
}
const slots = {
	inject(name, callback) {
		const dispose = settle(callback())
		return () => { disposed.push(`inject:${name}`); dispose() }
	},
	register(descriptor, component) {
		registered.push({ descriptor, component })
		return () => disposed.push(`register:${descriptor.name}`)
	},
}
mod.apply({ slots, effect(run, label) { effects.push({ label, dispose: run() }) } })

// ── the seats that were taken ───────────────────────────────────────────────
const seatNames = registered.map((entry) => entry.descriptor.name)
for (const seat of ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark']) {
	check(seatNames.includes(seat), `the seat "${seat}" was never taken`)
}
check(registered.length === 3, `${registered.length} registrations, expected 3`)
for (const entry of registered) {
	// The registry says it itself: a single slot already held at priority 0 is shadowed by a
	// lower number, and no number at all throws.
	check(entry.descriptor.priority < 0, `seat "${entry.descriptor.name}" was taken at priority ${entry.descriptor.priority}: lowest renders`)
	check(typeof entry.component === 'function', `seat "${entry.descriptor.name}" got no component`)
}

const componentOf = (seat) => registered.find((entry) => entry.descriptor.name === seat).component
/** Render through the wrappers: a slot occupant may return another component. */
const render = (node) => (typeof node.type === 'function' ? render(node.type(node.props)) : node)

// ── the row: the whole artwork, drawn as the author drew it ─────────────────
const rowArt = render(componentOf('sidebar.brand.name')({}))
check(rowArt.type === 'svg', `the row artwork renders a <${rowArt.type}>, not an svg`)
check(rowArt.props['data-dsh-brand'] === 'lockup', 'the row artwork carries no marker')
check(rowArt.props.viewBox === '0 0 495 120', `the canvas is not the drawn one: "${rowArt.props.viewBox}"`)
const ROW_HEIGHT = 30
check(Math.abs(rowArt.props.width - ROW_HEIGHT * (495 / 120)) < 1e-9 && rowArt.props.height === ROW_HEIGHT, 'the row artwork is not the drawn canvas at a uniform scale')

const [icon, name, badge] = rowArt.props.children
const shapes = icon.props.children
check(shapes.length === 4, `the icon draws ${shapes.length} shapes, expected 4`)
check(shapes[0].type === 'polyline' && shapes[0].props.points === '34,32 62,60 34,88', 'the chevron is not the drawn one')
check(shapes[0].props.stroke === LIGHT.accent && shapes[0].props.strokeWidth === 11, 'the chevron is not the drawn stroke in the light palette')
check(shapes[1].props.stroke === LIGHT.ink && shapes[1].props.x1 === 80 && shapes[1].props.y1 === 32 && shapes[1].props.y2 === 88 && shapes[1].props.strokeWidth === 11, 'the D stem is not the drawn one')
check(shapes[2].props.d === 'M 80,32 C 128,32 128,88 80,88' && shapes[2].props.stroke === LIGHT.ink, 'the D bowl is not the drawn curve')
check(shapes[3].props.stroke === LIGHT.accent && shapes[3].props.strokeWidth === 9 && shapes[3].props.x1 === 98 && shapes[3].props.y1 === 100 && shapes[3].props.x2 === 124 && shapes[3].props.y2 === 100, 'the underline is not the drawn one')
check(shapes.filter((shape) => shape.props.stroke === LIGHT.accent).length === 2, 'the accent must be on the chevron and the underline only')

check(name.props.x === 150 && name.props.y === 78, `the name sits at ${name.props.x},${name.props.y}, not at the drawn 150,78`)
check(name.props.fontSize === 50 && name.props.letterSpacing === -0.5, 'the name is not the drawn 50px with -0.5 tracking')
const [dav, code] = name.props.children
check(dav.props.children === 'Dav' && dav.props.fontWeight === 700, `the first half reads "${dav.props.children}" at weight ${dav.props.fontWeight}`)
check(code.props.children === 'Code' && code.props.fontWeight === 400, `the second reads "${code.props.children}" at weight ${code.props.fontWeight}`)
check(name.props.fill === LIGHT.name, `the name is ${name.props.fill} in light, not the drawn ${LIGHT.name}`)

const badgeRect = badge.props.children[0]
const badgeLabel = badge.props.children[1]
check(badge.props.transform === 'translate(372, 41)', `the badge is translated to "${badge.props.transform}", not to the drawn 372,41`)
check(badgeRect.props.width === 106 && badgeRect.props.height === 38 && badgeRect.props.rx === 8, 'the badge rectangle is not the drawn 106x38 with rx 8')
check(badgeRect.props.fill === LIGHT.badge, `the badge is ${badgeRect.props.fill} in light, not the drawn ${LIGHT.badge}`)
check(badgeLabel.props.x === 53 && badgeLabel.props.y === 19, `the badge label is placed at ${badgeLabel.props.x},${badgeLabel.props.y}, not at the drawn 53,19`)
check(badgeLabel.props.textAnchor === 'middle' && badgeLabel.props.dominantBaseline === 'central', 'the badge label must be centred by the engine, not by arithmetic')
check(badgeLabel.props.fontSize === 20 && badgeLabel.props.fontWeight === 700 && badgeLabel.props.letterSpacing === 2.5, 'the badge label is not the drawn 20px/700/2.5')
check(badgeLabel.props.fill === LIGHT.label && badgeLabel.props.children === 'AGENT', 'the badge label is not the drawn AGENT in the light palette')

// ── the mark: the drawn square canvas, for the rail ─────────────────────────
const mark = componentOf('sidebar.brand.mark')({ size: 24 })
check(mark.props.viewBox === '0 0 120 120', `the mark uses viewBox "${mark.props.viewBox}"`)
check(mark.props.width === 24 && mark.props.height === 24, 'the mark is not the drawn square at the requested edge')
check(mark.props['aria-label'] === 'DavCode', 'the mark has no accessible name for the collapsed rail')
check(mark.props.children.type === 'g' && mark.props.children.props.transform === 'translate(-21, -5)', 'the mark is missing the drawn group shift')
check(mark.props.children.props.children.length === 4, 'the rail mark is not the same four shapes')

// ── the hero: the same artwork, at the edge the host asks for ───────────────
const hero = componentOf('conversation.hero.brand.mark')({ size: 34 })
check(hero.props.viewBox === rowArt.props.viewBox, 'the hero artwork is not the same canvas as the row')
check(hero.props['aria-label'] === 'DavCode AGENT', 'the hero artwork has no accessible name')
check(Math.abs(hero.props.width - 34 * (495 / 120)) < 1e-9 && hero.props.height === 34, 'the hero artwork does not scale uniformly')

// ── the other ground: the same drawing, in the palette supplied for it ──────
const schemeObserver = observers.find((observer) => observer.target === root)
check(schemeObserver !== undefined, 'the colour scheme on the root element is not being watched')
root.style.colorScheme = 'dark'
schemeObserver?.fire()
const darkRow = render(componentOf('sidebar.brand.name')({}))
const [darkIcon, darkName, darkBadge] = darkRow.props.children
check(darkIcon.props.children[0].props.stroke === DARK.accent, `in dark the chevron is ${darkIcon.props.children[0].props.stroke}, not ${DARK.accent}`)
check(darkIcon.props.children[1].props.stroke === DARK.ink, `in dark the D is ${darkIcon.props.children[1].props.stroke}, not ${DARK.ink}`)
check(darkName.props.fill === DARK.name, `in dark the name is ${darkName.props.fill}, not ${DARK.name}`)
check(darkBadge.props.children[0].props.fill === DARK.badge, `in dark the badge is ${darkBadge.props.children[0].props.fill}, not ${DARK.badge}`)
check(darkBadge.props.children[1].props.fill === DARK.label, `in dark the label is ${darkBadge.props.children[1].props.fill}, not ${DARK.label}`)
const darkMark = componentOf('sidebar.brand.mark')({ size: 24 })
check(darkMark.props.children.props.children[0].props.stroke === DARK.accent, 'the rail mark does not follow the scheme')

// ── the window title ────────────────────────────────────────────────────────
const titleObserver = observers.find((observer) => observer.target === titleElement)
check(titleObserver !== undefined, 'the title element is not being watched')
documentStub.title = 'Nomi e segno — DeepSeek Harness'
titleObserver?.fire()
check(documentStub.title === 'Nomi e segno — DavCode AGENT', `with a session the title reads "${documentStub.title}"`)
documentStub.title = 'DeepSeek Harness'
titleObserver?.fire()
check(documentStub.title === 'DavCode AGENT', `without a session the title reads "${documentStub.title}"`)
documentStub.title = 'Qualcosa altro'
titleObserver?.fire()
check(documentStub.title === 'Qualcosa altro', 'the title guard rewrote a title it does not own')

// ── the tab icon ────────────────────────────────────────────────────────────
const icons = head.children.filter((child) => child.tagName === 'LINK')
const tabIcon = icons.find((child) => child.dataset?.plugin === 'dsh-brand-davcode')
check(tabIcon !== undefined, 'no tab icon was installed')
check(icons.length === 1, `${icons.length} icon links in the head: the shipped one must be put aside`)
check(shippedIcon.parentElement === null, 'the shipped icon link is still in the document')
const href = decodeURIComponent(tabIcon?.href ?? '')
check(href.startsWith('data:image/svg+xml,'), 'the tab icon is not an inline data uri')
check(href.includes('viewBox="0 0 120 120"'), 'the tab icon is not on the drawn mark canvas')
check(href.includes('transform="translate(-21, -5)"'), 'the tab icon lost the drawn group shift')
check(href.includes('points="34,32 62,60 34,88"'), 'the tab icon does not draw the chevron')
check(href.includes(DARK.accent), 'the tab icon does not carry the accent of the dark ground')
check(href.includes(DARK.ink), 'the tab icon does not carry the dark-ground ink')
check(href.includes('#141414'), 'the tab icon does not sit on the dark ground of the artwork')

// ── the rail: the separate mark seat shows only when the artwork does not ───
const seatsObserver = observers.find((observer) => observer.target === body)
check(seatsObserver !== undefined, 'the document is not watched for the rail and the row')
check(markSeat.style.display === 'none', 'with the artwork laid out, the separate rail mark must be hidden')
check(otherMarkSeat.style.display === '' || otherMarkSeat.style.display === undefined, 'a row without the artwork must keep its mark')
lockupNode.rect = { width: 0, height: 0 }
seatsObserver?.fire()
check(markSeat.style.display === '', 'in the rail, where the artwork is not laid out, the mark must come back')

// ── disposing must give everything back ─────────────────────────────────────
for (const effect of effects) check(typeof effect.dispose === 'function', `effect "${effect.label}" returned no disposer`)
for (const effect of effects) effect.dispose()
check(disposed.filter((entry) => entry.startsWith('register:')).length === 3, 'disposing did not release the three seats')
check(observers.every((observer) => observer.disconnected), 'disposing left an observer running')
check(tabIcon.removed === true, 'disposing left the tab icon in the document')
check(shippedIcon.parentElement === head, 'disposing did not put the shipped icon link back')

// ── what is installed is what is in this repository ────────────────────────
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12)
let installedNote = 'not installed'
if (fs.existsSync(path.join(INSTALLED, 'lib', 'client.js'))) {
	const pairs = ['lib/client.js', 'package.json'].map((rel) => {
		const local = path.join(PACK, rel)
		const remote = path.join(INSTALLED, rel)
		if (!fs.existsSync(remote)) return { rel, state: 'missing' }
		return { rel, state: digest(local) === digest(remote) ? 'same' : 'different', local: digest(local), remote: digest(remote) }
	})
	for (const pair of pairs) {
		if (pair.state !== 'same') failures.push(`${INSTALLED}/${pair.rel} is ${pair.state}: repository ${pair.local ?? '?'} vs installed ${pair.remote ?? '?'} — reinstall the pack or copy it back`)
	}
	installedNote = `${INSTALLED} (${pairs.map((pair) => `${pair.rel} ${pair.state}`).join(', ')})`
}

console.log(`effects: ${effects.map((effect) => effect.label).join(' | ')}`)
console.log(`seats taken: ${seatNames.join(', ')}`)
console.log(`artwork: canvas ${rowArt.props.viewBox}, ${shapes.length} shapes, name ${name.props.fontSize}px (${dav.props.children}/${code.props.children}) at ${name.props.x},${name.props.y}, badge ${badgeRect.props.width}x${badgeRect.props.height} at ${badge.props.transform}`)
console.log(`palettes: light accent ${LIGHT.accent} / dark accent ${DARK.accent}, verified on the row and the rail mark`)
console.log(`installed copy: ${installedNote}`)
console.log(`failures: ${failures.length}`)
for (const failure of failures) console.log('  ! ' + failure)
process.exit(failures.length === 0 ? 0 : 1)
