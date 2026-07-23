/**
 * Tenant discovery: one request to the documented GET /v1/Tenants operation.
 * The operation requires x-client-id and x-client-secret and returns an
 * array of tenants. Login uses a single attempt with a 30-second limit; the
 * general read-retry policy ships with the API commands.
 */
import {CliFailure, EXIT, redact} from './errors.js'

export interface DiscoveredTenant {
  id: string
  name: string | null
}

const REQUEST_TIMEOUT_MS = 30_000
/**
 * Bound for preserved upstream error text, applied after redaction so a
 * credential straddling the boundary can never leave a partial value
 * behind. Measured in UTF-16 code units, which equals bytes for the
 * ASCII bodies the contract describes.
 */
const MAX_PRESERVED_BODY_LENGTH = 16 * 1024
const TRUNCATION_MARKER = '…[truncated]'

function apiErrorFromBody(bodyText: string, redactionValues: string[]): unknown {
  const redacted = redact(bodyText, redactionValues)
  const bounded =
    redacted.length > MAX_PRESERVED_BODY_LENGTH
      ? redacted.slice(0, MAX_PRESERVED_BODY_LENGTH) + TRUNCATION_MARKER
      : redacted
  try {
    return JSON.parse(bounded)
  } catch {
    return bounded
  }
}

export async function discoverTenants(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<DiscoveredTenant[]> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/Tenants`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-client-id': clientId,
        'x-client-secret': clientSecret,
      },
      // Never follow a redirect: credential headers must not travel to
      // another location.
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    throw new CliFailure({
      code: timedOut ? 'network-timeout' : 'network-failure',
      message: `Tenant discovery could not reach ${baseUrl}: ${detail}`,
      exitCode: EXIT.network,
      retryable: true,
      attempts: 1,
    })
  }

  const bodyText = await response.text()
  const redactionValues = [clientId, clientSecret]

  if (response.status === 401 || response.status === 403) {
    throw new CliFailure({
      code: 'authentication-failed',
      message: 'The IntelliGRC API rejected the client credential.',
      exitCode: EXIT.authentication,
      httpStatus: response.status,
      attempts: 1,
      apiError: apiErrorFromBody(bodyText, redactionValues),
    })
  }

  if (response.status >= 300 && response.status < 400) {
    throw new CliFailure({
      code: 'unexpected-redirect',
      message:
        `Tenant discovery received a redirect (HTTP ${response.status}). ` +
        'The CLI never follows redirects with credential headers.',
      exitCode: EXIT.apiFailure,
      httpStatus: response.status,
      attempts: 1,
    })
  }

  if (!response.ok) {
    throw new CliFailure({
      code: 'api-failure',
      message: `Tenant discovery failed with HTTP ${response.status}.`,
      exitCode: EXIT.apiFailure,
      httpStatus: response.status,
      retryable: [408, 429, 500, 502, 503, 504].includes(response.status),
      attempts: 1,
      apiError: apiErrorFromBody(bodyText, redactionValues),
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    throw new CliFailure({
      code: 'api-response-invalid',
      message: 'Tenant discovery returned a body that is not valid JSON.',
      exitCode: EXIT.apiFailure,
      httpStatus: response.status,
      attempts: 1,
      apiError: apiErrorFromBody(bodyText, redactionValues),
    })
  }

  if (!Array.isArray(parsed)) {
    throw new CliFailure({
      code: 'api-response-invalid',
      message: 'Tenant discovery returned a body that is not a tenant array.',
      exitCode: EXIT.apiFailure,
      httpStatus: response.status,
      attempts: 1,
    })
  }

  return parsed.map((tenant: {id?: unknown; name?: unknown}) => ({
    id: String(tenant.id ?? ''),
    name: typeof tenant.name === 'string' ? tenant.name : null,
  }))
}
