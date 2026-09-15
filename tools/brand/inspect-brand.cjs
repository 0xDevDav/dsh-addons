// Look at the rebranding in both schemes: the sidebar row, the collapsed rail, and the
// blank-session screen where the artwork keeps its own proportions. Prints, for each
// scheme, the geometry that decides whether the drawn canvas fits the row's brand box.
//
//   node tools/brand/inspect-brand.cjs <url with token> [light|dark|both]
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const URL_WITH_TOKEN = process.argv[2]
const SCHEME = process.argv[3] ?? 'both'
if (!URL_WITH_TOKEN) {
	console.error('usage: node tools/brand/inspect-brand.cjs <url> [light|dark|both]')
	process.exit(2)
}
/** Captures land in the repository's `lab/` (override with BRAND_LAB); playwright must be resolvable. */
const LAB = process.env.BRAND_LAB ?? path.resolve(__dirname, '../../lab')
fs.mkdirSync(LAB, { recursive: true })

const MEASURE = () => {
	const box = (node) => {
		if (node === null) return null
		const r = node.getBoundingClientRect()
		return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), x: +r.x.toFixed(1), y: +r.y.toFixed(1) }
	}
	const row = document.querySelector('[class*="_logoRow"]')
	const lockup = row === null ? null : row.querySelector('[data-dsh-brand="lockup"]')
	// The box the fit measured against: the outermost ancestor of the artwork inside the row.
	const brand = (() => {
		if (lockup === null || row === null) return null
		let node = lockup
		while (node.parentElement !== null && node.parentElement !== row) node = node.parentElement
		return node.parentElement === row ? node : null
	})()
	// The drawn canvas is 120 units tall. If anything still clips the artwork — the row, if the
	// pack failed to open the brand box — the visible band of the canvas is narrower than the
	// whole. Reported in canvas units, with the clipper named, so a regression is a number.
	let band = null
	if (lockup !== null && brand !== null) {
		const svg = box(lockup)
		let clipper = null
		for (let node = lockup.parentElement; node !== null; node = node.parentElement) {
			if (getComputedStyle(node).overflow !== 'visible') { clipper = node; break }
		}
		const clip = clipper === null ? svg : box(clipper)
		const scale = svg.h / 120
		const top = clipper === null ? 0 : (svg.h - clip.h) / 2
		band = {
			scale: +scale.toFixed(4),
			clipper: clipper === null ? null : clipper.className.split(' ')[0],
			from: +(top / scale).toFixed(1),
			to: +((top + clip.h) / scale).toFixed(1),
			contentInside: top / scale <= 26.5 && (top + clip.h) / scale >= 104.5,
		}
	}
	const headline = document.querySelector('[class*="_headline"]')
	// The blank-session screen is meant to show the artwork alone: the host's own greeting
	// and preview badge live in the sibling of the seat, so that sibling must be out of the
	// layout. Reported with its text, which is in whatever language the client is running.
	let heroCopy = null
	if (headline !== null) {
		const heroLockup = headline.querySelector('[data-dsh-brand="lockup"]')
		const seat = heroLockup === null ? null : Array.from(headline.children).find((child) => child.contains(heroLockup))
		const copy = Array.from(headline.children).find((child) => child !== seat)
		if (copy !== undefined) heroCopy = { display: getComputedStyle(copy).display, text: copy.textContent }
	}
	return {
		title: document.title,
		rootScheme: document.documentElement.style.colorScheme,
		railVisible: document.querySelector('[class*="_railMark"]') !== null,
		heroCopy,
		brandBox: brand === null ? null : box(brand),
		brandRoom: brand === null ? null : { clientWidth: brand.clientWidth, overflow: getComputedStyle(brand).overflow },
		row: box(row),
		identity: box(document.querySelector('[class*="_brandIdentity"]')),
		lockup: box(lockup),
		mark: box(document.querySelector('[data-dsh-brand="mark"]')),
		markColor: (() => {
			const shape = document.querySelector('[data-dsh-brand="mark"] polyline, [data-dsh-brand="mark"] line')
			return shape === null ? null : shape.getAttribute('stroke')
		})(),
		nameFill: document.querySelector('[data-dsh-brand="lockup"] text')?.getAttribute('fill') ?? null,
		band,
	}
}

const capture = async (browser, scheme) => {
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme })
	const logs = []
	page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))
	page.on('console', (message) => { if (message.type() === 'error') logs.push(`[console] ${message.text()}`) })
	await page.goto(URL_WITH_TOKEN, { waitUntil: 'domcontentloaded' })
	await page.waitForTimeout(6000)

	const row = await page.$('[class*="_logoRow"]')
	if (row) await row.screenshot({ path: path.join(LAB, `row-${scheme}.png`) })
	console.log(scheme + ' row: ' + JSON.stringify(await page.evaluate(MEASURE)))

	// A dragged sidebar is a narrower room for the same drawing. Rather than open a settings
	// write, the row is narrowed for one dispatch — 204px leaves the artwork 164px of room,
	// which is 164 / 4.125 = 39.76px of art. (The room itself, not `_brand`, is what narrows:
	// the brand box is a `flex: 1` item, so its width comes from the row, not from CSS.)
	const narrow = await page.evaluate(() => {
		const row = document.querySelector('[class*="_logoRow"]')
		const lockup = row === null ? null : row.querySelector('[data-dsh-brand="lockup"]')
		if (lockup === null) return null
		let box = lockup
		while (box.parentElement !== row) box = box.parentElement
		const before = row.style.width
		row.style.width = '204px'
		window.dispatchEvent(new Event('resize'))
		const r = lockup.getBoundingClientRect()
		const after = { room: box.clientWidth, w: +r.width.toFixed(2), h: +r.height.toFixed(2) }
		row.style.width = before
		window.dispatchEvent(new Event('resize'))
		return after
	})
	console.log(scheme + ' narrow fit (204px row): ' + JSON.stringify(narrow))

	// The rail: collapse the sidebar and capture the mark seat on its own.
	const toggle = await page.$('[class*="_toggle"]')
	if (toggle) {
		await toggle.click()
		await page.waitForTimeout(1200)
		const rail = await page.$('[class*="_railMark"]')
		if (rail) await rail.screenshot({ path: path.join(LAB, `rail-${scheme}.png`) })
		console.log(scheme + ' rail: ' + JSON.stringify(await page.evaluate(MEASURE)))
		await toggle.click()
		await page.waitForTimeout(1200)
	}

	const newSession = await page.$('[class*="_newSession"]')
	if (newSession) {
		await newSession.click()
		await page.waitForTimeout(3000)
	}
	const hero = await page.$('[data-dsh-brand="lockup"]')
	if (hero) {
		const box = await hero.boundingBox()
		if (box) {
			const pad = 24
			await page.screenshot({
				path: path.join(LAB, `hero-${scheme}.png`),
				clip: {
					x: Math.max(0, box.x - pad),
					y: Math.max(0, box.y - pad),
					width: Math.min(1280, box.width + pad * 2),
					height: Math.min(900, box.height + pad * 2),
				},
			})
		}
	}
	console.log(scheme + ' hero: ' + JSON.stringify(await page.evaluate(MEASURE)))
	for (const line of logs) console.log('  ' + line)
	await page.close()
}

const main = async () => {
	const browser = await chromium.launch()
	const schemes = SCHEME === 'both' ? ['light', 'dark'] : [SCHEME]
	for (const scheme of schemes) await capture(browser, scheme)
	await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
