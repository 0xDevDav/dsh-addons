import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// Mechanical provenance check: prices.json against the official page, in both
// languages (USD column and CNY column) and the two timezone spellings of the rule.
import fs from 'node:fs'

const PACK = packPath('dsh-session-cost')
const { normalizeTable } = await import(`file:///${PACK}/lib/pricing.js`)
const table = normalizeTable(JSON.parse(fs.readFileSync(`${PACK}/prices.json`, 'utf8')))

let failures = 0
const check = (label, fn) => {
  try { fn(); console.log(`  ok   ${label}`) } catch (error) { failures++; console.log(`  FAIL ${label}: ${error.message}`) }
}
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance

console.log('official page (EN, USD) vs prices.json:')
const usd = {
  'deepseek-flash': { cacheHit: { peak: 0.006, offPeak: 0.003 }, input: { peak: 0.3, offPeak: 0.15 }, output: { peak: 1.2, offPeak: 0.6 } },
  'deepseek-v4-pro': { cacheHit: { peak: 0.044, offPeak: 0.022 }, input: { peak: 1.32, offPeak: 0.66 }, output: { peak: 3.96, offPeak: 1.98 } }
}
for (const [model, rows] of Object.entries(usd)) {
  for (const [bucket, rates] of Object.entries(rows)) {
    check(`${model} ${bucket}`, () => {
      const entry = table.models[model][bucket]
      if (!close(entry.peak, rates.peak) || !close(entry.offPeak, rates.offPeak)) throw new Error(`file has ${JSON.stringify(entry)}, page says ${JSON.stringify(rates)}`)
    })
  }
}

console.log('\nofficial page (ZH, CNY) vs the USD column, implied FX:')
const cny = {
  'deepseek-flash': { cacheHit: { peak: 0.04, offPeak: 0.02 }, input: { peak: 2, offPeak: 1 }, output: { peak: 8, offPeak: 4 } },
  'deepseek-v4-pro': { cacheHit: { peak: 0.3, offPeak: 0.15 }, input: { peak: 9, offPeak: 4.5 }, output: { peak: 27, offPeak: 13.5 } }
}
const ratios = []
for (const [model, rows] of Object.entries(cny)) {
  for (const [bucket, rates] of Object.entries(rows)) {
    const entry = table.models[model][bucket]
    ratios.push(rates.peak / entry.peak, rates.offPeak / entry.offPeak)
  }
}
const min = Math.min(...ratios)
const max = Math.max(...ratios)
check(`every CNY row converts to its USD row at one plausible rate (${min.toFixed(2)}–${max.toFixed(2)} CNY/USD)`, () => {
  if (max / min > 1.05) throw new Error(`spread too wide: ${min} … ${max}`)
  if (min < 6 || max > 7.5) throw new Error(`implausible FX: ${min} … ${max}`)
})

console.log('\nthe rule in the two spellings:')
const toUtc = (beijingHour) => (beijingHour - 8 + 24) % 24
check('Beijing 09:00-12:00 equals the file\'s 01:00-04:00 UTC', () => {
  if (toUtc(9) !== table.peak.windowsUtc[0].from || toUtc(12) !== table.peak.windowsUtc[0].to) throw new Error(`${toUtc(9)}-${toUtc(12)} vs ${JSON.stringify(table.peak.windowsUtc[0])}`)
})
check('Beijing 14:00-18:00 equals the file\'s 06:00-10:00 UTC', () => {
  if (toUtc(14) !== table.peak.windowsUtc[1].from || toUtc(18) !== table.peak.windowsUtc[1].to) throw new Error(`${toUtc(14)}-${toUtc(18)} vs ${JSON.stringify(table.peak.windowsUtc[1])}`)
})
check('weekdays are Monday-Friday in both', () => {
  if (JSON.stringify(table.peak.weekdaysUtc) !== JSON.stringify([1, 2, 3, 4, 5])) throw new Error(JSON.stringify(table.peak.weekdaysUtc))
})
check('off-peak is half of peak in every row', () => {
  for (const [model, rows] of Object.entries(usd)) {
    for (const [bucket, rates] of Object.entries(rows)) {
      if (!close(rates.offPeak * 2, rates.peak)) throw new Error(`${model} ${bucket}: ${rates.offPeak} * 2 != ${rates.peak}`)
    }
  }
})

console.log('\nprovenance recorded in the file:')
check('the file names the source and the day it was read', () => {
  const raw = JSON.parse(fs.readFileSync(`${PACK}/prices.json`, 'utf8'))
  if (raw.source.url !== 'https://api-docs.deepseek.com/quick_start/pricing/') throw new Error(raw.source.url)
  if (raw.source.retrievedAt !== '2026-09-14') throw new Error(raw.source.retrievedAt)
  if (raw.version !== '2026-09-14') throw new Error(raw.version)
})

console.log(`\nfailures: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
