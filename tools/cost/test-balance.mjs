import { packPath, packagesRoot, sessionsRoot, newestSessionLog, rootSessionId } from '../paths.mjs'
// The account-balance reader: response mapping, credential resolution, error
// mapping, and the one-answer-per-minute cache. Every provider call is stubbed.
import assert from 'node:assert/strict'

const PACK = packPath('dsh-session-cost')
const { normalizeBalance, createBalanceReader } = await import(`file:///${PACK}/lib/index.js`)

let failures = 0
const check = (label, fn) => {
  try { fn(); console.log(`  ok   ${label}`) } catch (error) { failures++; console.log(`  FAIL ${label}: ${error.message}`) }
}
const checkAsync = async (label, fn) => {
  try { await fn(); console.log(`  ok   ${label}`) } catch (error) { failures++; console.log(`  FAIL ${label}: ${error.message}`) }
}

// ── the response mapping ────────────────────────────────────────────────────
console.log('response mapping:')
check('a real answer keeps the provider strings verbatim', () => {
  const view = normalizeBalance({
    is_available: true,
    balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }]
  }, 42)
  assert.deepEqual(view, {
    available: true,
    isAvailable: true,
    balances: [{ currency: 'CNY', total: '110.00', granted: '10.00', toppedUp: '100.00' }],
    fetchedAt: 42
  })
})
check('an insufficient balance is reported, not hidden', () => {
  const view = normalizeBalance({ is_available: false, balance_infos: [{ currency: 'USD', total_balance: '0.00' }] })
  assert.equal(view.isAvailable, false)
  assert.equal(view.balances.length, 1)
})
check('every reported currency is kept', () => {
  const view = normalizeBalance({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '1.00' }, { currency: 'USD', total_balance: '2.00' }] })
  assert.deepEqual(view.balances.map((entry) => entry.currency), ['CNY', 'USD'])
})
check('a row without a currency is dropped, not guessed', () => {
  const view = normalizeBalance({ is_available: true, balance_infos: [{ total_balance: '1.00' }, { currency: 'CNY', total_balance: '2.00' }] })
  assert.deepEqual(view.balances.map((entry) => entry.currency), ['CNY'])
})
check('numeric amounts are accepted and stringified', () => {
  const view = normalizeBalance({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: 3.5 }] })
  assert.equal(view.balances[0].total, '3.5')
})
check('a malformed body is refused rather than read as zero', () => {
  for (const bad of [null, 'nope', {}, { is_available: true }, { balance_infos: 'nope' }]) {
    assert.deepEqual(normalizeBalance(bad), { available: false, reason: 'malformed' }, JSON.stringify(bad))
  }
})

// ── the reader ──────────────────────────────────────────────────────────────
console.log('\nreader:')
const realFetch = globalThis.fetch
const realKey = process.env.DEEPSEEK_API_KEY
const realBase = process.env.DEEPSEEK_BASE_URL
let calls = []
const answer = (body, status = 200) => async (url, init) => {
  calls.push({ url, init })
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}
const credentials = (value, source = 'file') => ({
  get: (name) => (name === 'credentials' ? { resolve: async () => (value === undefined ? undefined : { value, source }) } : undefined),
  logger: { warn: () => {} }
})
const balancePayload = {
  is_available: true,
  balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }]
}

await checkAsync('a stored credential is resolved and used as the bearer token', async () => {
  calls = []
  globalThis.fetch = answer(balancePayload)
  const value = await createBalanceReader(credentials('sk-stored')).read()
  assert.equal(value.available, true)
  assert.equal(value.balances[0].total, '110.00')
  assert.equal(value.source, 'file')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.deepseek.com/user/balance')
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-stored')
  assert.equal(JSON.stringify(value).includes('sk-stored'), false, 'the key never rides the answer')
})

await checkAsync('one answer is reused inside the minute', async () => {
  calls = []
  globalThis.fetch = answer(balancePayload)
  const reader = createBalanceReader(credentials('sk-stored'))
  await reader.read()
  await reader.read()
  await reader.read()
  assert.equal(calls.length, 1, `provider calls: ${calls.length}`)
})

await checkAsync('the launching environment supplies the key when no store does', async () => {
  calls = []
  process.env.DEEPSEEK_API_KEY = 'sk-env'
  try {
    globalThis.fetch = answer(balancePayload)
    const value = await createBalanceReader({ get: () => undefined, logger: { warn: () => {} } }).read()
    assert.equal(value.available, true)
    assert.equal(value.source, 'env')
    assert.equal(calls[0].init.headers.authorization, 'Bearer sk-env')
  } finally {
    if (realKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = realKey
  }
})

await checkAsync('without a key nothing is called and the cause is named', async () => {
  calls = []
  const previous = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  try {
    globalThis.fetch = answer(balancePayload)
    const value = await createBalanceReader({ get: () => undefined, logger: { warn: () => {} } }).read()
    assert.deepEqual(value, { available: false, reason: 'missing-credential' })
    assert.equal(calls.length, 0, 'no provider call without a credential')
  } finally {
    if (previous !== undefined) process.env.DEEPSEEK_API_KEY = previous
  }
})

await checkAsync('the endpoint variable is honored', async () => {
  calls = []
  process.env.DEEPSEEK_BASE_URL = 'https://gateway.internal/v1/'
  try {
    globalThis.fetch = answer(balancePayload)
    await createBalanceReader(credentials('sk-stored')).read()
    assert.equal(calls[0].url, 'https://gateway.internal/v1/user/balance')
  } finally {
    if (realBase === undefined) delete process.env.DEEPSEEK_BASE_URL
    else process.env.DEEPSEEK_BASE_URL = realBase
  }
})

await checkAsync('a refused key is reported as such', async () => {
  globalThis.fetch = answer({ error: { message: 'Authentication Fails' } }, 401)
  assert.deepEqual(await createBalanceReader(credentials('sk-bad')).read(), { available: false, reason: 'unauthorized' })
})

await checkAsync('a server error carries its status', async () => {
  globalThis.fetch = answer({}, 503)
  assert.deepEqual(await createBalanceReader(credentials('sk-stored')).read(), { available: false, reason: 'http-503' })
})

await checkAsync('an unreachable provider is reported, not retried forever', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed') }
  assert.deepEqual(await createBalanceReader(credentials('sk-stored')).read(), { available: false, reason: 'network' })
})

await checkAsync('a timeout is named as a timeout', async () => {
  globalThis.fetch = async () => { const error = new Error('timed out'); error.name = 'TimeoutError'; throw error }
  assert.deepEqual(await createBalanceReader(credentials('sk-stored')).read(), { available: false, reason: 'timeout' })
})

await checkAsync('a malformed provider answer is refused', async () => {
  globalThis.fetch = answer({ unexpected: true })
  assert.deepEqual(await createBalanceReader(credentials('sk-stored')).read(), { available: false, reason: 'malformed' })
})

await checkAsync('a failure is cached too, so a bad key cannot be hammered', async () => {
  calls = []
  globalThis.fetch = answer({}, 401)
  const reader = createBalanceReader(credentials('sk-bad'))
  await reader.read()
  await reader.read()
  assert.equal(calls.length, 1)
})

await checkAsync('a failing credentials service falls through to the environment', async () => {
  calls = []
  process.env.DEEPSEEK_API_KEY = 'sk-env2'
  try {
    globalThis.fetch = answer(balancePayload)
    const ctx = {
      get: () => ({ resolve: async () => { throw new Error('store offline') } }),
      logger: { warn: () => {} }
    }
    const value = await createBalanceReader(ctx).read()
    assert.equal(value.available, true)
    assert.equal(calls[0].init.headers.authorization, 'Bearer sk-env2')
  } finally {
    if (realKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = realKey
  }
})

globalThis.fetch = realFetch
console.log(`\nfailures: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
