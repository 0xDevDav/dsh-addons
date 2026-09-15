// Draw the DavCode mark into a Windows .ico, for the launcher's shortcut.
//
// The mark is the supplied dark SVG, verbatim, on the same #141414 ground the tab icon
// uses — a tile reads on a light and a dark taskbar alike, while bare white strokes would
// vanish on a light one. Rendering is Chromium's (playwright must be resolvable), so the
// raster is the browser's own: one PNG per size, packed into an .ico container with no
// image library involved.
//
//   node tools/brand/make-icon.mjs [out.ico]
//
// Also writes lab/icon-<size>.png so the result can be looked at without opening Explorer.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Through require, not import: a playwright that lives outside this tree (an npx cache,
// say) is then still found via NODE_PATH, or given outright in PLAYWRIGHT_MODULE.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright')

const SIZES = [256, 128, 64, 48, 32, 16]
const LAB = process.env.BRAND_LAB ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../lab')
const DEFAULT_OUT = path.join(
	process.env.DSH_LAUNCHER_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(process.env.HOME ?? '.', 'AppData/Local'), 'dsh'),
	'davcode.ico',
)
const OUT = process.argv[2] ?? DEFAULT_OUT

/** The mark as supplied, with its group shift, over the dark ground the tab icon uses. */
const EDGE = 120
const TILE = { radius: 26, fill: '#141414' }
const SHAPES = [
	{ tag: 'polyline', points: '34,32 62,60 34,88', stroke: '#00FF9D', width: 11 },
	{ tag: 'line', x1: 80, y1: 32, x2: 80, y2: 88, stroke: '#F5F5F5', width: 11 },
	{ tag: 'path', d: 'M 80,32 C 128,32 128,88 80,88', stroke: '#F5F5F5', width: 11 },
	{ tag: 'line', x1: 98, y1: 100, x2: 124, y2: 100, stroke: '#00FF9D', width: 9 },
]

const markup = () =>
	SHAPES.map((shape) => {
		const common = `stroke="${shape.stroke}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"`
		if (shape.tag === 'polyline') return `<polyline points="${shape.points}" ${common}/>`
		if (shape.tag === 'line') return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${common}/>`
		return `<path d="${shape.d}" ${common}/>`
	}).join('')

const svg = (size) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${EDGE} ${EDGE}" width="${size}" height="${size}">` +
	`<rect width="${EDGE}" height="${EDGE}" rx="${TILE.radius}" fill="${TILE.fill}"/>` +
	`<g transform="translate(-21, -5)">${markup()}</g></svg>`

// ── the .ico container: a directory of PNG images, which is what Windows 10/11 read ──
const ico = (images) => {
	const header = Buffer.alloc(6)
	header.writeUInt16LE(0, 0)          // reserved
	header.writeUInt16LE(1, 2)          // 1 = icon
	header.writeUInt16LE(images.length, 4)
	const directory = Buffer.alloc(16 * images.length)
	let offset = header.length + directory.length
	images.forEach((image, index) => {
		const at = index * 16
		directory[at] = image.size >= 256 ? 0 : image.size
		directory[at + 1] = image.size >= 256 ? 0 : image.size
		directory[at + 2] = 0            // palette
		directory[at + 3] = 0            // reserved
		directory.writeUInt16LE(1, at + 4)      // colour planes
		directory.writeUInt16LE(32, at + 6)     // bits per pixel
		directory.writeUInt32LE(image.data.length, at + 8)
		directory.writeUInt32LE(offset, at + 12)
		offset += image.data.length
	})
	return Buffer.concat([header, directory, ...images.map((image) => image.data)])
}

const main = async () => {
	fs.mkdirSync(LAB, { recursive: true })
	const browser = await chromium.launch()
	const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 })
	const images = []
	for (const size of SIZES) {
		await page.setViewportSize({ width: size, height: size })
		await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(size)}`)
		const data = await page.locator('svg').screenshot({ omitBackground: true })
		images.push({ size, data })
		fs.writeFileSync(path.join(LAB, `icon-${size}.png`), data)
	}
	await browser.close()

	fs.mkdirSync(path.dirname(OUT), { recursive: true })
	const packed = ico(images)
	fs.writeFileSync(OUT, packed)
	console.log(`icon written: ${OUT}  (${packed.length} bytes, ${SIZES.join('/')} px)`)
	console.log(`previews: ${LAB}/icon-256.png … icon-16.png`)
}

main().catch((error) => { console.error(error); process.exit(1) })
