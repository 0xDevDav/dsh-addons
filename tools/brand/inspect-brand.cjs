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
	const lockup = document.querySelector('[data-dsh-brand="lockup"]')
	const brand = lockup === null ? null : lockup.closest('[class*="_brand"]')
	// The drawn canvas is 120 units tall; the row's brand box clips, so what is actually
	// visible is the band of the canvas the box covers. Reported in canvas units.
	let band = null
	if (lockup !== null && brand !== null) {
		const svg = box(lockup)
		const clip = box(brand)
		const scale = svg.h / 120
		const top = (svg.h - clip.h) / 2
		band = {
			scale: +scale.toFixed(4),
			from: +(top / scale).toFixed(1),
			to: +((top + clip.h) / scale).toFixed(1),
			contentInside: top / scale <= 26.5 && (top + clip.h) / scale >= 104.5,
		}
	}
	return {
		title: document.title,
		rootScheme: document.documentElement.style.colorScheme,
		railVisible: document.querySelector('[class*="_railMark"]') !== null,
		brandBox: brand === null ? null : box(brand),
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
