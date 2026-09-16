/**
 * Guarded HTTP transport for every API command. One call sends one
 * documented request — a GET read or a POST, PUT, or DELETE write — and
 * enforces the issue #1 contracts: credential headers, per-attempt timeout,
 * bounded retries, Retry-After delays, same-host-only redirects, mandatory
 * certificate validation (no bypass option exists), upstream-error
 * preservation, and exit-code mapping.
 *
 * Retry eligibility is verb-aware. A POST (create) is never retried, because
 * a network failure it cannot confirm could otherwise produce a duplicate
 * record; on such a failure it reports the check-IntelliGRC message. A GET,
 * PUT, or DELETE retries on the existing transient categories, because
 * repeating it lands on the same result.
 *
 * The transport is independent of oclif so fake-server and live tests
 * exercise the same request policy. It writes to no process stream either:
 * reporting a retried success lives in report.ts, so a library caller
 * consuming the `core` export subpath decides what its own output is.
 */
import {type EnvironmentVariables} from '../environment.js'
import {CliFailure, EXIT} from '../errors.js'
import {apiErrorFromBody} from './response.js'
import {
  MAX_ATTEMPTS,
  isRetryableStatus,
  parseRetryAfter,
  resolveAttemptTimeoutMs,
  retryDelayMs,
} from './retry.js'

const MAX_REDIRECT_HOPS = 5

/** Query parameters under their documented names, in send order. */
export type QueryPairs = Array<[name: string, value: string]>

/** The documented HTTP methods the transport can send. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface ApiRequestOptions {
  baseUrl: string
  /** Documented path, for example "/v1/Tenants". */
  path: string
  /**
   * Documented HTTP method. Defaults to GET so existing read callers need
   * no change. POST is the only method the transport never retries.
   */
  method?: HttpMethod
  /**
   * Query parameters under their documented names. An omitted parameter
   * is absent from this list, so it never appears in the query string.
   */
  query?: QueryPairs
  /**
   * Optional JSON request body. When present, the transport serializes it
   * and sends "Content-Type: application/json". A DELETE carries no body.
   */
  body?: unknown
  clientId: string
  clientSecret: string
  /** Omitted for the tenant-list operation, which documents no tenant header. */
  tenantId?: string
  /** Documented permission for the mapped operation, named on 401/403. */
  permission?: string | null
  /** Values that must never appear in any output. */
  redactionValues: string[]
  env: EnvironmentVariables
}

export interface ApiSuccess {
  httpStatus: number
  /** The parsed JSON response body, or undefined for a 204 No Content reply. */
  body: unknown
  attempts: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port
}

/**
 * OpenSSL and Node TLS error codes that mean certificate validation
 * failed. A certificate failure is permanent for the duration of a
 * command, so it gets one attempt and is never marked retryable.
 */
const CERTIFICATE_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'CERT_SIGNATURE_FAILURE',
  'CERT_UNTRUSTED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'HOSTNAME_MISMATCH',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
])

function isCertificateError(error: unknown): boolean {
  const cause = error instanceof Error ? (error.cause as {code?: unknown}) : undefined
  return typeof cause?.code === 'string' && CERTIFICATE_ERROR_CODES.has(cause.code)
}

function networkFailure(error: unknown, attempts: number, method: HttpMethod): CliFailure {
  const timedOut = error instanceof Error && error.name === 'TimeoutError'
  const detail =
    error instanceof Error
      ? (error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message)
      : String(error)

  if (isCertificateError(error)) {
    return new CliFailure({
      code: 'tls-certificate-invalid',
      message:
        `Certificate validation failed: ${detail}. The CLI keeps ` +
        'certificate validation enabled and offers no bypass.',
      exitCode: EXIT.network,
      retryable: false,
      attempts,
    })
  }

  // A create whose network attempt fails cannot be confirmed: the server may
  // have created the record before the connection broke. Retrying could
  // create a duplicate, so the transport stops and tells the user to check
  // IntelliGRC before running the command again.
  if (method === 'POST') {
    return new CliFailure({
      code: 'create-unconfirmed',
      message:
        `The create request could not be confirmed: ${detail}. The CLI did ` +
        'not retry it, because retrying a create can produce a duplicate ' +
        'record. Check IntelliGRC to see whether the record was created ' +
        'before you run this command again.',
      exitCode: EXIT.network,
      retryable: false,
      attempts,
    })
  }

  return new CliFailure({
    code: timedOut ? 'network-timeout' : 'network-failure',
    message: timedOut
      ? `The request attempt exceeded its time limit: ${detail}`
      : `The request could not complete: ${detail}`,
    exitCode: EXIT.network,
    retryable: true,
    attempts,
  })
}

function httpFailure(
  status: number,
  bodyText: string,
  attempts: number,
  options: ApiRequestOptions,
): CliFailure {
  const apiError = apiErrorFromBody(bodyText, options.redactionValues)
  const common = {
    httpStatus: status,
    retryable: isRetryableStatus(status),
    attempts,
    apiError,
  }

  if (status === 401 || status === 403) {
    const permissionNote = options.permission
      ? ` The mapped operation documents the permission "${options.permission}".`
      : ''
    return new CliFailure({
      code: 'authentication-failed',
      message:
        'The IntelliGRC API rejected the request as unauthenticated or ' +
        `unauthorized (HTTP ${status}).${permissionNote}`,
      exitCode: EXIT.authentication,
      ...common,
      retryable: false,
    })
  }

  if (status === 404) {
    return new CliFailure({
      code: 'not-found',
      message: `The IntelliGRC API returned HTTP 404 for ${options.path}.`,
      exitCode: EXIT.notFound,
      ...common,
    })
  }

  if (status === 429) {
    return new CliFailure({
      code: 'rate-limited',
      message: 'The IntelliGRC API rate-limited the request (HTTP 429).',
      exitCode: EXIT.rateLimited,
      ...common,
    })
  }

  return new CliFailure({
    code: 'api-failure',
    message: `The IntelliGRC API request failed with HTTP ${status}.`,
    exitCode: EXIT.apiFailure,
    ...common,
  })
}

/**
 * Fetch one response for a single attempt, following at most
 * MAX_REDIRECT_HOPS same-host redirects. Credential headers never travel
 * to another protocol, hostname, or port; a cross-host redirect is a
 * terminal redirect-policy failure.
 */
async function fetchAttempt(
  startUrl: URL,
  method: HttpMethod,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
  attempts: number,
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs)
  let url = startUrl

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    // A same-host redirect replays the same method and body, so a redirected
    // write reaches its destination unchanged.
    const response = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal,
    })

    if (response.status < 300 || response.status >= 400) {
      return response
    }

    const location = response.headers.get('location')
    if (!location) {
      throw new CliFailure({
        code: 'redirect-invalid',
        message: `The API redirected (HTTP ${response.status}) without a Location header.`,
        exitCode: EXIT.network,
        httpStatus: response.status,
        attempts,
      })
    }

    const target = new URL(location, url)
    if (!sameOrigin(url, target)) {
      throw new CliFailure({
        code: 'redirect-cross-host',
        message:
          'The API redirected to a different host. The CLI never sends ' +
          'credential headers to another host, so the redirect was not followed.',
        exitCode: EXIT.network,
        httpStatus: response.status,
        attempts,
      })
    }

    url = target
  }

  throw new CliFailure({
    code: 'redirect-limit-exceeded',
    message: `The API redirected more than ${MAX_REDIRECT_HOPS} times.`,
    exitCode: EXIT.network,
    attempts,
  })
}

export async function apiRequest(options: ApiRequestOptions): Promise<ApiSuccess> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-client-id': options.clientId,
    'x-client-secret': options.clientSecret,
  }
  if (options.tenantId !== undefined) {
    headers['x-tenant-id'] = options.tenantId
  }

  let serializedBody: string | undefined
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    serializedBody = JSON.stringify(options.body)
  }

  // A POST is never retried: a network failure it cannot confirm could
  // otherwise duplicate a create, and an ambiguous transient HTTP status
  // (a 502 or 504 returned after the record was already created) carries the
  // same risk. Every other method retries on the existing transient
  // categories, because repeating it lands on the same result.
  const retriesAllowed = method !== 'POST'

  const startUrl = new URL(`${options.baseUrl}${options.path}`)
  for (const [name, value] of options.query ?? []) {
    startUrl.searchParams.append(name, value)
  }
  const attemptTimeoutMs = resolveAttemptTimeoutMs(options.env)
  const deadline = Date.now() + MAX_ATTEMPTS * attemptTimeoutMs

  let lastFailure: CliFailure | undefined
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response
    let bodyText: string
    try {
      response = await fetchAttempt(
        startUrl,
        method,
        headers,
        serializedBody,
        attemptTimeoutMs,
        attempt,
      )
      // The abort signal also bounds the body read; a stall while reading
      // is the same timeout category as a stall before headers.
      bodyText = await response.text()
    } catch (error) {
      if (error instanceof CliFailure) {
        // Redirect-policy failures are terminal: retrying replays the
        // same redirect.
        throw error
      }

      lastFailure = networkFailure(error, attempt, method)
      if (retriesAllowed && lastFailure.retryable && attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(attempt, null, Math.max(0, deadline - Date.now())))
        continue
      }

      throw lastFailure
    }

    if (response.ok) {
      // A 204 No Content reply (the documented delete success) carries no
      // body, so there is nothing to parse.
      if (response.status === 204) {
        return {httpStatus: response.status, body: undefined, attempts: attempt}
      }

      let body: unknown
      try {
        body = JSON.parse(bodyText)
      } catch {
        throw new CliFailure({
          code: 'api-response-invalid',
          message: `The API response for ${options.path} is not valid JSON.`,
          exitCode: EXIT.apiFailure,
          httpStatus: response.status,
          attempts: attempt,
          apiError: apiErrorFromBody(bodyText, options.redactionValues),
        })
      }

      return {httpStatus: response.status, body, attempts: attempt}
    }

    lastFailure = httpFailure(response.status, bodyText, attempt, options)
    if (retriesAllowed && isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), Date.now())
      await sleep(retryDelayMs(attempt, retryAfterMs, Math.max(0, deadline - Date.now())))
      continue
    }

    throw lastFailure
  }

  // Unreachable: every loop exit returns or throws. Satisfies the compiler.
  throw lastFailure ?? new Error('request loop ended without a result')
}
