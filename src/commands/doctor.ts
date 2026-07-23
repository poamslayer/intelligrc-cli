import {Command} from '@oclif/core'

import {apiRequest, emitRetryDiagnostic} from '../api/client.js'
import {resolveBaseUrl} from '../base-url.js'
import {CliFailure, EXIT, emitFailure} from '../errors.js'
import {commandSpec, oclifFlags} from '../manifest.js'
import {ProfileStore} from '../profile-store.js'
import {KeyringSecretStore} from '../secret-store.js'

const spec = commandSpec('doctor')

/** Check names in execution order. Doctor stops at the first failure. */
const CHECKS = [
  'profile-complete',
  'client-secret-access',
  'base-url-https',
  'tenant-list-access',
  'tenant-agreement',
] as const

export default class Doctor extends Command {
  static override summary = spec.summary

  static override description =
    'Checks the saved profile in order: completeness, protected-secret ' +
    'access, the HTTPS transport rule, tenant-list access, and exact ' +
    'agreement between the returned tenant and the saved profile. Doctor ' +
    'diagnoses the stored configuration, so INTELLIGRC_* overrides are ' +
    'ignored. It performs no request beyond tenant listing and never ' +
    'prints client, secret, or tenant values.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(Doctor)
    const profileName = flags.profile as string

    const passed: Array<{check: string; status: 'pass'}> = []
    const redactionValues: string[] = []
    try {
      // Check 1: the profile exists and is complete.
      const profile = new ProfileStore(this.config.configDir).get(profileName)
      if (!profile) {
        throw new CliFailure({
          code: 'profile-not-found',
          message:
            `The profile "${profileName}" does not exist. ` +
            'Create it with: intelligrc auth login --profile NAME --client-id ID',
          exitCode: EXIT.localConfiguration,
        })
      }

      redactionValues.push(profile.clientId, profile.tenantId)
      if (!profile.clientId || !profile.tenantId || !profile.baseUrl) {
        throw new CliFailure({
          code: 'profile-incomplete',
          message:
            `The profile "${profileName}" is missing a client ID, tenant ID, ` +
            'or base URL. Recreate it with: intelligrc auth login --replace',
          exitCode: EXIT.localConfiguration,
        })
      }

      passed.push({check: 'profile-complete', status: 'pass'})

      // Check 2: the protected secret store returns the client secret.
      const clientSecret = new KeyringSecretStore().get(profileName)
      if (!clientSecret) {
        throw new CliFailure({
          code: 'client-secret-missing',
          message:
            `No client secret exists for the profile "${profileName}" in ` +
            'the protected secret store. Recreate the profile with: ' +
            'intelligrc auth login --replace',
          exitCode: EXIT.localConfiguration,
        })
      }

      redactionValues.push(clientSecret)
      passed.push({check: 'client-secret-access', status: 'pass'})

      // Check 3: the saved base URL satisfies the HTTPS transport rule.
      let baseUrl: string
      try {
        baseUrl = resolveBaseUrl(profile.baseUrl, process.env)
      } catch (error) {
        const detail = error instanceof CliFailure ? error.message : String(error)
        throw new CliFailure({
          code: 'profile-base-url-invalid',
          message: `The saved base URL for profile "${profileName}" is invalid: ${detail}`,
          exitCode: EXIT.localConfiguration,
        })
      }

      passed.push({check: 'base-url-https', status: 'pass'})

      // Check 4: the documented tenant-list operation is reachable with
      // the profile credential. Doctor performs no request beyond this one.
      const result = await apiRequest({
        baseUrl,
        path: '/v1/Tenants',
        clientId: profile.clientId,
        clientSecret,
        permission: null,
        redactionValues,
        env: process.env,
      })
      emitRetryDiagnostic(result.attempts)
      passed.push({check: 'tenant-list-access', status: 'pass'})

      // Check 5: the returned tenant agrees exactly with the saved profile.
      if (!Array.isArray(result.body)) {
        throw new CliFailure({
          code: 'api-response-invalid',
          message: 'The tenant-list response is not a tenant array.',
          exitCode: EXIT.apiFailure,
          httpStatus: result.httpStatus,
          attempts: result.attempts,
        })
      }

      const returnedIds = result.body.map((tenant: {id?: unknown}) =>
        String(tenant?.id ?? ''),
      )
      redactionValues.push(...returnedIds)
      if (result.body.length !== 1 || returnedIds[0] !== profile.tenantId) {
        throw new CliFailure({
          code: 'doctor-tenant-mismatch',
          message:
            result.body.length === 1
              ? 'The credential returned one tenant, but it is not the saved ' +
                'profile tenant. Recreate the profile with: intelligrc auth ' +
                'login --replace'
              : `The credential returned ${result.body.length} tenants; the ` +
                'saved profile names exactly one. Recreate the profile with: ' +
                'intelligrc auth login --replace',
          exitCode: EXIT.localConfiguration,
        })
      }

      passed.push({check: 'tenant-agreement', status: 'pass'})

      this.log(JSON.stringify({doctor: {checks: passed, result: 'pass'}}, null, 2))
    } catch (error) {
      const failedCheck = CHECKS[passed.length] ?? 'unexpected'
      const failure =
        error instanceof CliFailure
          ? new CliFailure({
              code: error.code,
              message: `Doctor stopped at check "${failedCheck}": ${error.message}`,
              exitCode: error.exitCode,
              httpStatus: error.httpStatus,
              retryable: error.retryable,
              attempts: error.attempts,
              apiError: error.apiError,
            })
          : error
      this.exit(emitFailure(failure, redactionValues))
    }
  }
}
