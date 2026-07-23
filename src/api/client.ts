/**
 * Guarded HTTP transport for every API command. One call sends one
 * documented GET request and enforces the issue #1 contracts: credential
 * headers, per-attempt timeout, bounded retries, Retry-After delays,
 * same-host-only redirects, mandatory certificate validation (no bypass
 * option exists), upstream-error preservation, and exit-code mapping.
 *
 * The transport is independent of oclif so fake-server and live tests
 * exercise the same request policy.
 */
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

export interface ApiRequestOptions {
  baseUrl: string
  /** Documented path, for example "/v1/Tenants". */
  path: string
  /**
   * Query parameters under their documented names. An omitted filter is
   * absent from this list, so it never appears in the query string.
   */
  query?: Array<[name: string, value: string]>
  clientId: string
  clientSecret: string
  /** Omitted for the tenant-list operation, which documents no tenant header. */
  tenantId?: string
  /** Documented permission for the mapped operation, named on 401/403. */
  permission?: string | null
  /** Values that must never appear in any output. */
  redactionValues: string[]
  env: NodeJS.ProcessEnv
}

export interface ApiSuccess {
  httpStatus: number
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

function networkFailure(error: unknown, attempts: number): CliFailure {
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
  headers: Record<string, string>,
  timeoutMs: number,
  attempts: number,
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs)
  let url = startUrl

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers,
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
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-client-id': options.clientId,
    'x-client-secret': options.clientSecret,
  }
  if (options.tenantId !== undefined) {
    headers['x-tenant-id'] = options.tenantId
  }

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
      response = await fetchAttempt(startUrl, headers, attemptTimeoutMs, attempt)
      // The abort signal also bounds the body read; a stall while reading
      // is the same timeout category as a stall before headers.
      bodyText = await response.text()
    } catch (error) {
      if (error instanceof CliFailure) {
        // Redirect-policy failures are terminal: retrying replays the
        // same redirect.
        throw error
      }

      lastFailure = networkFailure(error, attempt)
      if (lastFailure.retryable && attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(attempt, null, Math.max(0, deadline - Date.now())))
        continue
      }

      throw lastFailure
    }

    if (response.ok) {
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
    if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), Date.now())
      await sleep(retryDelayMs(attempt, retryAfterMs, Math.max(0, deadline - Date.now())))
      continue
    }

    throw lastFailure
  }

  // Unreachable: every loop exit returns or throws. Satisfies the compiler.
  throw lastFailure ?? new Error('request loop ended without a result')
}

/**
 * Report a retried success on stderr, per the contract: a retried request
 * reports its total attempt count without changing successful API data.
 */
export function emitRetryDiagnostic(attempts: number): void {
  if (attempts > 1) {
    process.stderr.write(
      `${JSON.stringify({diagnostic: {code: 'request-retried', attempts}})}\n`,
    )
  }
}
