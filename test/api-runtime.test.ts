/**
 * Forces every network and HTTP failure category of the guarded request
 * runtime through the built CLI process, using `tenant list` as the
 * runtime's first API command.
 */
import assert from 'node:assert/strict'
import {after, before, test} from 'node:test'

import {TEST_SECRET, createProfile, setupAuthContext, type AuthContext} from './helpers/auth-fixtures.ts'
import {startFakeApi, type FakeApi} from './helpers/fake-api.ts'
import {startSelfSignedTlsApi} from './helpers/fake-tls.ts'
import {runCli, type CliResult} from './helpers/run-cli.ts'

let api: FakeApi
let ctx: AuthContext

before(async () => {
  api = await startFakeApi()
  ctx = setupAuthContext()
  await createProfile(api, ctx, 'runtime')
})

after(async () => {
  await api.close()
})

function listTenants(extraEnv: Record<string, string> = {}): Promise<CliResult> {
  return runCli(['tenant', 'list', '--profile', 'runtime'], {
    home: ctx.home,
    env: {...ctx.env, ...extraEnv},
  })
}

function stderrError(result: CliResult): Record<string, unknown> {
  return JSON.parse(result.stderr.trim().split('\n').at(-1)!).error
}

test('temporary server failures retry to success and report the attempt count', async () => {
  api.enqueue({status: 500, body: {message: 'boom'}})
  api.enqueue({status: 502, body: {message: 'boom'}})
  api.enqueue({status: 200, body: [{id: 'tenant-runtime', name: 'Tenant runtime'}]})
  const requestsBefore = api.requests.length

  const result = await listTenants()

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), [{id: 'tenant-runtime', name: 'Tenant runtime'}])
  assert.equal(api.requests.length, requestsBefore + 3)
  assert.deepEqual(JSON.parse(result.stderr.trim()), {
    diagnostic: {code: 'request-retried', attempts: 3},
  })
})

test('exhausted temporary failures stop at three attempts and exit 8', async () => {
  api.enqueue({status: 503, body: {message: 'down'}})
  api.enqueue({status: 503, body: {message: 'down'}})
  api.enqueue({status: 503, body: {message: 'down'}})
  const requestsBefore = api.requests.length

  const result = await listTenants()

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore + 3)
  const error = stderrError(result)
  assert.equal(error.httpStatus, 503)
  assert.equal(error.retryable, true)
  assert.equal(error.attempts, 3)
})

test('HTTP 408 and 504 are retryable', async () => {
  api.enqueue({status: 408, body: {}})
  api.enqueue({status: 504, body: {}})
  api.enqueue({status: 200, body: []})
  const requestsBefore = api.requests.length

  const result = await listTenants()

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.length, requestsBefore + 3)
})

test('exhausted HTTP 429 exits 6 and honors a Retry-After delta delay', async () => {
  api.enqueue({status: 429, headers: {'retry-after': '1'}, body: {message: 'slow down'}})
  api.enqueue({status: 429, headers: {'retry-after': '0'}, body: {message: 'slow down'}})
  api.enqueue({status: 429, headers: {'retry-after': '0'}, body: {message: 'slow down'}})
  const requestsBefore = api.requests.length

  const started = Date.now()
  const result = await listTenants()
  const elapsed = Date.now() - started

  assert.equal(result.code, 6)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore + 3)
  assert.equal(stderrError(result).attempts, 3)
  assert.ok(elapsed >= 900, `expected the 1s Retry-After delay, elapsed ${elapsed}ms`)
})

test('Retry-After accepts an HTTP date', async () => {
  // A date already in the past parses to a zero delay and still retries.
  api.enqueue({
    status: 429,
    headers: {'retry-after': 'Wed, 22 Jul 2020 12:00:00 GMT'},
    body: {},
  })
  api.enqueue({status: 200, body: []})
  const requestsBefore = api.requests.length

  const result = await listTenants()

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.length, requestsBefore + 2)
})

test('HTTP 400, 401, 403, and 404 get one attempt and their exit category', async () => {
  const cases: Array<{status: number; exitCode: number}> = [
    {status: 400, exitCode: 8},
    {status: 401, exitCode: 4},
    {status: 403, exitCode: 4},
    {status: 404, exitCode: 7},
  ]

  for (const {status, exitCode} of cases) {
    api.enqueue({status, body: {message: `denied ${status}`}})
    const requestsBefore = api.requests.length

    const result = await listTenants()

    assert.equal(result.code, exitCode, `HTTP ${status}: ${result.stderr}`)
    assert.equal(result.stdout, '', `HTTP ${status} must keep stdout empty`)
    assert.equal(api.requests.length, requestsBefore + 1, `HTTP ${status} must not retry`)
    const error = stderrError(result)
    assert.equal(error.httpStatus, status)
    assert.equal(error.retryable, false)
    assert.equal(error.attempts, 1)
  }
})

test('a connection failure retries three times and exits 5', async () => {
  const unreachable = await startFakeApi()
  await unreachable.close()

  const result = await listTenants({INTELLIGRC_BASE_URL: unreachable.url})

  assert.equal(result.code, 5)
  assert.equal(result.stdout, '')
  const error = stderrError(result)
  assert.equal(error.attempts, 3)
  assert.equal(error.retryable, true)
})

test('a stalled response times out per attempt and exits 5', async () => {
  api.enqueue({status: 200, body: [], delayMs: 3000})
  api.enqueue({status: 200, body: [], delayMs: 3000})
  api.enqueue({status: 200, body: [], delayMs: 3000})
  const requestsBefore = api.requests.length

  const result = await listTenants({INTELLIGRC_ATTEMPT_TIMEOUT_MS: '400'})

  assert.equal(result.code, 5)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore + 3)
  const error = stderrError(result)
  assert.equal(error.code, 'network-timeout')
  assert.equal(error.attempts, 3)
})

test('a same-host redirect is followed with credential headers', async () => {
  api.enqueue({status: 302, headers: {location: '/v1/Tenants?hop=1'}, rawBody: ''})
  api.enqueue({status: 200, body: []})
  const requestsBefore = api.requests.length

  const result = await listTenants()

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.length, requestsBefore + 2)
  const followed = api.requests.at(-1)!
  assert.equal(followed.path, '/v1/Tenants?hop=1')
  assert.equal(followed.headers['x-client-id'], 'client-runtime')
  assert.equal(followed.headers['x-client-secret'], TEST_SECRET)
})

test('a cross-host redirect exits 5 and sends nothing to the other host', async () => {
  const other = await startFakeApi()
  try {
    api.enqueue({status: 302, headers: {location: `${other.url}/v1/Tenants`}, rawBody: ''})

    const result = await listTenants()

    assert.equal(result.code, 5)
    assert.equal(result.stdout, '')
    assert.equal(stderrError(result).code, 'redirect-cross-host')
    assert.equal(other.requests.length, 0)
  } finally {
    await other.close()
  }
})

test('certificate validation stays enabled: a self-signed host exits 5', async () => {
  const tls = await startSelfSignedTlsApi()
  try {
    const result = await listTenants({INTELLIGRC_BASE_URL: tls.url})

    assert.equal(result.code, 5)
    assert.equal(result.stdout, '')
    assert.equal(tls.requestCount(), 0)
  } finally {
    await tls.close()
  }
})

test('a JSON error body labeled text/plain is parsed into error.apiError', async () => {
  api.enqueue({
    status: 400,
    rawBody: JSON.stringify({title: 'Bad Request', detail: 'no client id was provided'}),
    headers: {'content-type': 'text/plain'},
  })

  const result = await listTenants()

  assert.equal(result.code, 8)
  assert.deepEqual(stderrError(result).apiError, {
    title: 'Bad Request',
    detail: 'no client id was provided',
  })
})

test('a large non-JSON error body is bounded, truncated, and redacted', async () => {
  api.enqueue({
    status: 400,
    rawBody: `${TEST_SECRET} began the body ${'A'.repeat(20_000)}`,
    headers: {'content-type': 'text/html'},
  })

  const result = await listTenants()

  assert.equal(result.code, 8)
  const preserved = stderrError(result).apiError as string
  assert.equal(typeof preserved, 'string')
  assert.ok(preserved.startsWith('[REDACTED] began the body'))
  assert.ok(preserved.endsWith('…[truncated]'))
  assert.ok(preserved.length <= 16 * 1024 + '…[truncated]'.length)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('every failure writes one normalized JSON error object to stderr', async () => {
  api.enqueue({status: 500, body: {message: 'boom'}})
  api.enqueue({status: 500, body: {message: 'boom'}})
  api.enqueue({status: 500, body: {message: 'boom'}})

  const result = await listTenants()

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = stderrError(result)
  assert.equal(typeof error.code, 'string')
  assert.equal(typeof error.message, 'string')
  assert.equal(typeof error.retryable, 'boolean')
  assert.equal(typeof error.attempts, 'number')
  assert.equal(error.httpStatus, 500)
})
