// The collapsed sidebar, whole: how many marks are actually painted in the rail, and where.
//
//   node tools/brand/shoot-rail.cjs <url with token> [light|dark]
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const URL_WITH_TOKEN = process.argv[2]
const SCHEME = process.argv[3] ?? 'dark'
if (!URL_WITH_TOKEN) {
	console.error('usage: node tools/brand/shoot-rail.cjs <url> [light|dark]')
	process.exit(2)
}
/** Captures land in the repository's `lab/` (override with BRAND_LAB); playwright must be resolvable. */
const LAB = process.env.BRAND_LAB ?? path.resolve(__dirname, '../../lab')
fs.mkdirSync(LAB, { recursive: true })

const main = async () => {
	const browser = await chromium.launch()
	const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 3, colorScheme: SCHEME })
	const logs = []
	page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))
	await page.goto(URL_WITH_TOKEN, { waitUntil: 'domcontentloaded' })
	await page.waitForTimeout(6000)
	const toggle = await page.$('[class*="_toggle"]')
	if (toggle) await toggle.click()
	await page.waitForTimeout(1500)
	const out = path.join(LAB, `rail-page-${SCHEME}.png`)
	await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 140, height: 260 } })
	console.log(`screenshot: ${out}`)
	console.log(JSON.stringify(await page.evaluate(() => {
		const box = (node) => {
			const r = node.getBoundingClientRect()
			return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: Math.round(r.x), y: Math.round(r.y), shown: getComputedStyle(node).display !== 'none' }
		}
		return {
			marks: [...document.querySelectorAll('[data-dsh-brand="mark"]')].map((node) => ({ ...box(node), seat: node.closest('[class*="_railMark"]') !== null ? 'railMark' : 'brandMark' })),
			lockups: [...document.querySelectorAll('[data-dsh-brand="lockup"]')].map(box),
		}
	}), null, 1))
	for (const line of logs) console.log('  ' + line)
	await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
