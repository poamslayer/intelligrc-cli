/**
 * Failure contract from issue #1. Every auth-command failure is one JSON
 * object on stderr:
 *   {"error": {"code", "message", "httpStatus"?, "retryable", "attempts",
 *              "apiError"?}}
 * passed through redaction so credential values never reach any output.
 */

/** Exit codes from the issue #1 contract. */
export const EXIT = {
  unexpected: 1,
  invalidInput: 2,
  localConfiguration: 3,
  authentication: 4,
  network: 5,
  rateLimited: 6,
  notFound: 7,
  apiFailure: 8,
} as const

export interface FailureFields {
  code: string
  message: string
  exitCode: number
  httpStatus?: number
  retryable?: boolean
  attempts?: number
  apiError?: unknown
}

export class CliFailure extends Error {
  readonly code: string
  readonly exitCode: number
  readonly httpStatus?: number
  readonly retryable: boolean
  readonly attempts: number
  readonly apiError?: unknown

  constructor(fields: FailureFields) {
    super(fields.message)
    this.code = fields.code
    this.exitCode = fields.exitCode
    this.httpStatus = fields.httpStatus
    this.retryable = fields.retryable ?? false
    this.attempts = fields.attempts ?? 0
    this.apiError = fields.apiError
  }
}

/** Replace every occurrence of each secret value with a fixed marker. */
export function redact(text: string, secrets: Array<string | null | undefined>): string {
  let result = text
  for (const secret of secrets) {
    if (secret) {
      result = result.split(secret).join('[REDACTED]')
    }
  }

  return result
}

/**
 * Write one redacted failure object to stderr and return the exit code the
 * command must exit with. Non-CliFailure errors map to exit code 1.
 */
export function emitFailure(
  error: unknown,
  secrets: Array<string | null | undefined>,
): number {
  const failure =
    error instanceof CliFailure
      ? error
      : new CliFailure({
          code: 'unexpected-failure',
          message: error instanceof Error ? error.message : String(error),
          exitCode: EXIT.unexpected,
        })

  const body: Record<string, unknown> = {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
    attempts: failure.attempts,
  }
  if (failure.httpStatus !== undefined) {
    body.httpStatus = failure.httpStatus
  }

  if (failure.apiError !== undefined) {
    body.apiError = failure.apiError
  }

  process.stderr.write(`${redact(JSON.stringify({error: body}), secrets)}\n`)
  return failure.exitCode
}
