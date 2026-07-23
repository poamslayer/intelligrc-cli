/**
 * Retry policy from the issue #1 contract. An idempotent read gets at most
 * MAX_ATTEMPTS total attempts. Only temporary network failures and the six
 * temporary HTTP statuses are retryable. Retry-After supports delta seconds
 * and HTTP dates; every delay is capped at the remaining request policy
 * budget so retries can never extend a command past TOTAL_BUDGET_MS.
 */

export const MAX_ATTEMPTS = 3

/** Per-attempt limit from the contract: each attempt stops after 30 seconds. */
export const ATTEMPT_TIMEOUT_MS = 30_000

/** Total request policy budget: MAX_ATTEMPTS attempts of 30 seconds each. */
export const TOTAL_BUDGET_MS = MAX_ATTEMPTS * ATTEMPT_TIMEOUT_MS

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
    retryAfterMs ?? DEFAULT_BACKOFF_MS[Math.min(attempt, DEFAULT_BACKOFF_MS.length) - 1]
  return Math.max(0, Math.min(wanted, remainingBudgetMs))
}
