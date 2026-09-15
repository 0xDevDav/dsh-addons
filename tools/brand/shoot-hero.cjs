// The blank-session screen as a whole, in the scheme asked for: the brand artwork in the
// hero, with the headline it sits next to, so the composition can be judged rather than
// just the artwork.
//
//   node tools/brand/shoot-hero.cjs <url with token> [light|dark]
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const URL_WITH_TOKEN = process.argv[2]
const SCHEME = process.argv[3] ?? 'dark'
if (!URL_WITH_TOKEN) {
	console.error('usage: node tools/brand/shoot-hero.cjs <url> [light|dark]')
	process.exit(2)
}
/** Captures land in the repository's `lab/` (override with BRAND_LAB); playwright must be resolvable. */
const LAB = process.env.BRAND_LAB ?? path.resolve(__dirname, '../../lab')
fs.mkdirSync(LAB, { recursive: true })

const main = async () => {
	const browser = await chromium.launch()
	const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2, colorScheme: SCHEME })
	const logs = []
	page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))
	await page.goto(URL_WITH_TOKEN, { waitUntil: 'domcontentloaded' })
	await page.waitForTimeout(6000)
	const newSession = await page.$('[class*="_newSession"]')
	if (newSession) await newSession.click()
	await page.waitForTimeout(3000)
	const out = path.join(LAB, `blank-${SCHEME}.png`)
	await page.screenshot({ path: out, clip: { x: 280, y: 120, width: 1000, height: 420 } })
	console.log(`screenshot: ${out}`)
	console.log(JSON.stringify(await page.evaluate(() => {
		const lockup = document.querySelector('[class*="_headline"] [data-dsh-brand="lockup"]')
		const headline = document.querySelector('[class*="_headline"]')
		const box = (node) => (node === null ? null : { w: Math.round(node.getBoundingClientRect().width), h: Math.round(node.getBoundingClientRect().height) })
		return { headline: box(headline), headlineInHero: box(lockup), text: headline?.textContent ?? null }
	})))
	for (const line of logs) console.log('  ' + line)
	await browser.close()
}

main().catch((error) => { console.error(error); process.exit(1) })
