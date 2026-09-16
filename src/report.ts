/**
 * The two places the CLI writes to standard error: one redacted failure
 * object, and the retry diagnostic that accompanies a success.
 *
 * They sit here rather than beside the failure type and the transport,
 * because both of those are published through the `core` export subpath. A
 * library caller consuming that subpath reports failures its own way, and
 * nothing it imports may write to a process stream on its behalf.
 */
import {CliFailure, EXIT, redact} from './errors.js'

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
