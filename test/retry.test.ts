import assert from 'node:assert/strict'
import {test} from 'node:test'

import {
  isRetryableStatus,
  parseRetryAfter,
  resolveAttemptTimeoutMs,
  retryDelayMs,
  ATTEMPT_TIMEOUT_MS,
  MAX_ATTEMPTS,
  TOTAL_BUDGET_MS,
} from '../src/api/retry.ts'

test('retry policy caps total attempts at three', () => {
  assert.equal(MAX_ATTEMPTS, 3)
})

test('total request policy budget is ninety seconds', () => {
  assert.equal(TOTAL_BUDGET_MS, 90_000)
})

test('exactly the six temporary HTTP statuses are retryable', () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableStatus(status), true, `HTTP ${status} must be retryable`)
  }

  for (const status of [200, 301, 400, 401, 403, 404, 418, 501, 505]) {
    assert.equal(isRetryableStatus(status), false, `HTTP ${status} must not be retryable`)
  }
})

test('parseRetryAfter reads delta seconds', () => {
  assert.equal(parseRetryAfter('2', 1_000_000), 2000)
  assert.equal(parseRetryAfter('0', 1_000_000), 0)
})

test('parseRetryAfter reads an HTTP date relative to now', () => {
  const now = Date.parse('2026-07-22T12:00:00Z')
  assert.equal(parseRetryAfter('Wed, 22 Jul 2026 12:00:03 GMT', now), 3000)
})

test('parseRetryAfter clamps a past HTTP date to zero', () => {
  const now = Date.parse('2026-07-22T12:00:10Z')
  assert.equal(parseRetryAfter('Wed, 22 Jul 2026 12:00:00 GMT', now), 0)
})

test('parseRetryAfter returns null for garbage, negatives, and absent values', () => {
  assert.equal(parseRetryAfter('soon', 0), null)
  assert.equal(parseRetryAfter('-5', 0), null)
  assert.equal(parseRetryAfter('1.5', 0), null)
  assert.equal(parseRetryAfter('', 0), null)
  assert.equal(parseRetryAfter(null, 0), null)
})

test('retryDelayMs uses the server delay when one is parsed', () => {
  assert.equal(retryDelayMs(1, 2000, 60_000), 2000)
})

test('retryDelayMs floors a server delay below 100ms to 100ms', () => {
  // A zero-delay reconnect trips a libuv teardown assertion on Windows
  // (async.c uv_async_send on a closing handle), and an immediate retry
  // against a rate-limited API is wrong anyway.
  assert.equal(retryDelayMs(1, 0, 60_000), 100)
  assert.equal(retryDelayMs(1, 40, 60_000), 100)
  // The remaining budget still wins over the floor.
  assert.equal(retryDelayMs(1, 0, 60), 60)
})

test('retryDelayMs caps the server delay at the remaining budget', () => {
  assert.equal(retryDelayMs(1, 30_000, 4000), 4000)
})

test('retryDelayMs backs off 500ms then 1000ms without a server delay', () => {
  assert.equal(retryDelayMs(1, null, 60_000), 500)
  assert.equal(retryDelayMs(2, null, 60_000), 1000)
})

test('retryDelayMs never exceeds the remaining budget', () => {
  assert.equal(retryDelayMs(2, null, 300), 300)
  assert.equal(retryDelayMs(1, null, 0), 0)
})

test('the test-only attempt-timeout variable can shorten but never extend', () => {
  assert.equal(resolveAttemptTimeoutMs({}), ATTEMPT_TIMEOUT_MS)
  assert.equal(resolveAttemptTimeoutMs({INTELLIGRC_ATTEMPT_TIMEOUT_MS: '400'}), 400)
  assert.equal(
    resolveAttemptTimeoutMs({INTELLIGRC_ATTEMPT_TIMEOUT_MS: '600000'}),
    ATTEMPT_TIMEOUT_MS,
  )
  assert.equal(resolveAttemptTimeoutMs({INTELLIGRC_ATTEMPT_TIMEOUT_MS: '0'}), ATTEMPT_TIMEOUT_MS)
  assert.equal(
    resolveAttemptTimeoutMs({INTELLIGRC_ATTEMPT_TIMEOUT_MS: 'fast'}),
    ATTEMPT_TIMEOUT_MS,
  )
})
