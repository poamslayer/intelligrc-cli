/**
 * Retry policy from the issue #1 contract. An idempotent read gets at most
 * MAX_ATTEMPTS total attempts. Only temporary network failures and the six
 * temporary HTTP statuses are retryable. Retry-After supports delta seconds
 * and HTTP dates; every delay is capped at the remaining request policy
 * budget so retries can never extend a command past TOTAL_BUDGET_MS.
 */
// A type-only import, erased at run time: this module deliberately loads
// nothing, so a test can import it directly under Node's type stripping.
import type {EnvironmentVariables} from '../environment.js'

export const MAX_ATTEMPTS = 3

/** Per-attempt limit from the contract: each attempt stops after 30 seconds. */
export const ATTEMPT_TIMEOUT_MS = 30_000

/** Total request policy budget: MAX_ATTEMPTS attempts of 30 seconds each. */
export const TOTAL_BUDGET_MS = MAX_ATTEMPTS * ATTEMPT_TIMEOUT_MS

/**
 * Per-attempt limit for one request. INTELLIGRC_ATTEMPT_TIMEOUT_MS exists
 * for automated fake-API tests, which cannot wait 30 seconds to observe
 * the timeout category. It can only shorten an attempt: the contractual
 * 30-second limit stays the ceiling, so the variable cannot extend any
 * request.
 */
export function resolveAttemptTimeoutMs(env: EnvironmentVariables): number {
  const raw = env.INTELLIGRC_ATTEMPT_TIMEOUT_MS
  if (raw !== undefined && /^\d+$/.test(raw) && Number(raw) > 0) {
    return Math.min(Number(raw), ATTEMPT_TIMEOUT_MS)
  }

  return ATTEMPT_TIMEOUT_MS
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status)
}

/**
 * Parse one Retry-After header value into a millisecond delay.
 * Accepts non-negative integer delta seconds or an HTTP date; a past date
 * clamps to zero. Returns null when the value is absent or unparseable.
 */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) {
    return null
  }

  if (/^\d+$/.test(value.trim())) {
    return Number(value.trim()) * 1000
  }

  // Only an HTTP date remains valid here. Every HTTP date contains letters;
  // without this guard Date.parse accepts numeric noise such as "1.5".
  if (!/[A-Za-z]/.test(value)) {
    return null
  }

  const dateMs = Date.parse(value)
  if (Number.isNaN(dateMs)) {
    return null
  }

  return Math.max(0, dateMs - nowMs)
}

/** Backoff when the server names no delay: 500ms after attempt 1, then 1s. */
const DEFAULT_BACKOFF_MS = [500, 1000]

/**
 * Floor for a server-provided delay. A "Retry-After: 0" reconnects with
 * no gap, which trips a libuv teardown assertion on Windows (async.c,
 * uv_async_send on a closing handle) and hammers an API that just asked
 * for restraint. One hundred milliseconds still honors the header.
 */
const MIN_SERVER_DELAY_MS = 100

/**
 * Delay before the attempt that follows `attempt` (1-based). A parsed
 * server delay wins over the default backoff; both are capped at the
 * remaining policy budget.
 */
export function retryDelayMs(
  attempt: number,
  retryAfterMs: number | null,
  remainingBudgetMs: number,
): number {
  const wanted =
    retryAfterMs === null
      ? DEFAULT_BACKOFF_MS[Math.min(attempt, DEFAULT_BACKOFF_MS.length) - 1]
      : Math.max(retryAfterMs, MIN_SERVER_DELAY_MS)
  return Math.max(0, Math.min(wanted, remainingBudgetMs))
}
