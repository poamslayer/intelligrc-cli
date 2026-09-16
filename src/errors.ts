/**
 * Failure contract from issue #1. Every auth-command failure is one JSON
 * object on stderr:
 *   {"error": {"code", "message", "httpStatus"?, "retryable", "attempts",
 *              "apiError"?}}
 * passed through redaction so credential values never reach any output.
 *
 * This module defines the vocabulary and the failure type. Writing a failure
 * to standard error lives in report.ts, because a library caller consuming
 * the `core` export subpath handles its own reporting and must never have a
 * process stream written on its behalf.
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

/**
 * The published description of every exit code, in numeric order. It sits
 * beside EXIT so the two cannot drift, and `intelligrc commands` prints it so
 * an agent can read the exit contract without opening the documentation.
 */
export const EXIT_CODE_CATALOG = [
  {code: 0, name: 'success', meaning: 'The command completed.'},
  {code: EXIT.unexpected, name: 'unexpected', meaning: 'An unexpected local failure.'},
  {
    code: EXIT.invalidInput,
    name: 'invalid-input',
    meaning: 'The command line was rejected before any request was sent.',
  },
  {
    code: EXIT.localConfiguration,
    name: 'local-configuration',
    meaning: 'The profile is missing, incomplete, or unreadable.',
  },
  {
    code: EXIT.authentication,
    name: 'authentication',
    meaning: 'The API rejected the credential or the permission.',
  },
  {code: EXIT.network, name: 'network', meaning: 'The request could not reach the API.'},
  {code: EXIT.rateLimited, name: 'rate-limited', meaning: 'The API reported HTTP 429.'},
  {code: EXIT.notFound, name: 'not-found', meaning: 'The API reported HTTP 404.'},
  {code: EXIT.apiFailure, name: 'api-failure', meaning: 'The API failed for another reason.'},
] as const

/**
 * The published error vocabulary. `intelligrc commands` prints it, so an
 * agent can learn what a failure code means without reading source or docs.
 *
 * Retryability is deliberately absent. It is not a property of the code: an
 * `api-failure` is retryable for HTTP 502 and not for HTTP 400. Every failure
 * object carries its own `retryable` field at the moment it is emitted, and
 * that is the value to act on.
 */
export const ERROR_CATALOG = {
  /**
   * Codes that name one specific failure. Grouped by the exit code they
   * carry, then alphabetical.
   */
  codes: [
    // Exit 1: an unexpected local failure.
    {code: 'unexpected-failure', exitCode: EXIT.unexpected, meaning: 'A local failure the CLI does not classify.'},

    // Exit 2: the command line was rejected before any request was sent.
    {code: 'base-url-invalid', exitCode: EXIT.invalidInput, meaning: 'The given base URL is not a valid URL.'},
    {code: 'base-url-requires-https', exitCode: EXIT.invalidInput, meaning: 'The given base URL is not HTTPS, and the host is not loopback.'},
    {code: 'client-secret-empty', exitCode: EXIT.invalidInput, meaning: 'The supplied client secret is an empty string.'},
    {code: 'client-secret-flag-rejected', exitCode: EXIT.invalidInput, meaning: 'A client secret was passed on the command line. Use --client-secret-env or the prompt, so the secret stays out of shell history.'},
    {code: 'client-secret-prompt-unavailable', exitCode: EXIT.invalidInput, meaning: 'No terminal is attached, so the secret cannot be prompted for. Use --client-secret-env.'},
    {code: 'command-not-found', exitCode: EXIT.invalidInput, meaning: 'The named command does not exist. Run "intelligrc commands" for the catalog.'},
    {code: 'conflicting-output-flags', exitCode: EXIT.invalidInput, meaning: '--json was combined with an --output format other than json.'},
    {code: 'delete-confirmation-unavailable', exitCode: EXIT.invalidInput, meaning: 'A delete needed confirmation, no terminal was attached, and --force was absent. Nothing was deleted.'},
    {code: 'delete-declined', exitCode: EXIT.invalidInput, meaning: 'The delete confirmation was answered with anything other than yes. Nothing was deleted.'},
    {code: 'identity-required', exitCode: EXIT.invalidInput, meaning: 'No --profile, no INTELLIGRC_CREDENTIALS_FILE, and no complete environment identity.'},
    {code: 'identity-source-conflict', exitCode: EXIT.invalidInput, meaning: '--profile and INTELLIGRC_CREDENTIALS_FILE were both supplied.'},
    {code: 'missing-required-argument', exitCode: EXIT.invalidInput, meaning: 'A required positional argument was absent.'},
    {code: 'missing-required-flag', exitCode: EXIT.invalidInput, meaning: 'A required flag was absent.'},
    {code: 'profile-name-invalid', exitCode: EXIT.invalidInput, meaning: 'The profile name contains characters the CLI does not allow.'},
    {code: 'prompt-cancelled', exitCode: EXIT.invalidInput, meaning: 'The secret prompt was cancelled with Ctrl+C.'},
    {code: 'unexpected-argument', exitCode: EXIT.invalidInput, meaning: 'More positional arguments were given than the command takes.'},
    {code: 'unknown-flag', exitCode: EXIT.invalidInput, meaning: 'A flag the command does not define was given.'},

    // Exit 3: the local profile is missing, incomplete, or unreadable.
    {code: 'client-secret-env-missing', exitCode: EXIT.localConfiguration, meaning: 'The environment variable named by --client-secret-env is unset or empty.'},
    {code: 'client-secret-missing', exitCode: EXIT.localConfiguration, meaning: 'The profile exists but the secrets file holds no secret for it.'},
    {code: 'credentials-file-invalid', exitCode: EXIT.localConfiguration, meaning: 'The credentials file has the wrong version or lacks a required field.'},
    {code: 'credentials-file-permissions', exitCode: EXIT.localConfiguration, meaning: 'The credentials file is readable by group or others. Run chmod 600 on it.'},
    {code: 'credentials-file-unreadable', exitCode: EXIT.localConfiguration, meaning: 'The credentials file cannot be opened or parsed.'},
    {code: 'doctor-tenant-mismatch', exitCode: EXIT.localConfiguration, meaning: 'The tenant the credential returns is not the tenant saved in the profile.'},
    {code: 'profile-base-url-invalid', exitCode: EXIT.localConfiguration, meaning: 'The base URL saved in the profile is not usable.'},
    {code: 'profile-exists', exitCode: EXIT.localConfiguration, meaning: 'A profile of that name already exists. Pass --replace to overwrite it.'},
    {code: 'profile-incomplete', exitCode: EXIT.localConfiguration, meaning: 'The saved profile is missing a value the command needs.'},
    {code: 'profile-not-found', exitCode: EXIT.localConfiguration, meaning: 'No profile of that name is saved.'},
    {code: 'profiles-file-unreadable', exitCode: EXIT.localConfiguration, meaning: 'The profiles file exists but cannot be read or parsed.'},
    {code: 'profiles-file-write-failed', exitCode: EXIT.localConfiguration, meaning: 'The profiles file could not be written.'},
    {code: 'rollback-failed', exitCode: EXIT.localConfiguration, meaning: 'A profile change failed and the previous state could not be restored. The message names what to check.'},
    {code: 'secret-store-failure', exitCode: EXIT.localConfiguration, meaning: 'The secrets file could not be read, parsed, or written.'},
    {code: 'secrets-file-permissions', exitCode: EXIT.localConfiguration, meaning: 'The secrets file is readable by group or others. Run chmod 600 on it.'},

    // Exit 4: the API rejected the credential or the permission.
    {code: 'authentication-failed', exitCode: EXIT.authentication, meaning: 'The API rejected the client credential, or the credential lacks the documented permission.'},

    // Exit 5: the request could not reach the API, or its result is unknown.
    {code: 'create-unconfirmed', exitCode: EXIT.network, meaning: 'A create failed with an unconfirmable result and was deliberately not retried. Check IntelliGRC before sending it again, so a retry cannot duplicate the record.'},
    {code: 'network-failure', exitCode: EXIT.network, meaning: 'The request could not reach the API.'},
    {code: 'network-timeout', exitCode: EXIT.network, meaning: 'The request reached the attempt timeout.'},
    {code: 'redirect-cross-host', exitCode: EXIT.network, meaning: 'The API redirected to another host. The CLI never sends credential headers off-host, so it did not follow.'},
    {code: 'redirect-invalid', exitCode: EXIT.network, meaning: 'The API redirected without a Location header.'},
    {code: 'redirect-limit-exceeded', exitCode: EXIT.network, meaning: 'The API redirected more times than the CLI follows.'},
    {code: 'tls-certificate-invalid', exitCode: EXIT.network, meaning: 'The API certificate failed validation. The CLI has no bypass.'},

    // Exit 6, 7, and 8: the API answered, but not with a result.
    {code: 'rate-limited', exitCode: EXIT.rateLimited, meaning: 'The API reported HTTP 429 after the CLI exhausted its retries.'},
    {code: 'not-found', exitCode: EXIT.notFound, meaning: 'The API reported HTTP 404 for the requested record.'},
    {code: 'api-failure', exitCode: EXIT.apiFailure, meaning: 'The API returned a failure status the CLI does not classify further.'},
    {code: 'api-response-invalid', exitCode: EXIT.apiFailure, meaning: 'The API returned a success status with a body that is not valid JSON.'},
    {code: 'tenant-discovery-empty', exitCode: EXIT.apiFailure, meaning: 'The credential returned no tenant, so no profile could be saved.'},
    {code: 'tenant-discovery-multiple', exitCode: EXIT.apiFailure, meaning: 'The credential returned more than one tenant. Login saves a profile only when exactly one is returned.'},
    {code: 'unexpected-redirect', exitCode: EXIT.apiFailure, meaning: 'Tenant discovery was redirected. The CLI never follows a redirect carrying credential headers.'},
  ],

  /**
   * A code family. The rest of the code names the input that failed, for
   * example `invalid-evaluation-id` or `invalid-framework-id`. Match an exact
   * code first, then fall back to a prefix.
   */
  families: [
    {
      prefix: 'invalid-',
      exitCode: EXIT.invalidInput,
      meaning:
        'A flag, argument, or request-body value failed validation before ' +
        'any request was sent. The rest of the code names the input.',
    },
  ],

  /**
   * Not a failure. A diagnostic is written to standard error while the
   * command still succeeds, so it never changes the exit code.
   */
  diagnostics: [
    {
      code: 'request-retried',
      meaning:
        'A request succeeded after one or more retries. The object carries ' +
        'the total attempt count.',
    },
  ],
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

  /** Copy of this failure with a prefixed message and every field kept. */
  withMessagePrefix(prefix: string): CliFailure {
    return new CliFailure({
      code: this.code,
      message: `${prefix}${this.message}`,
      exitCode: this.exitCode,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
      attempts: this.attempts,
      apiError: this.apiError,
    })
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
