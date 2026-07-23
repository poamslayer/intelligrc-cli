/**
 * Configuration resolver for API commands. Requires the named profile,
 * applies the documented INTELLIGRC_* environment overrides, retrieves the
 * client secret, and re-validates the base URL under the runtime rule:
 * a saved or overridden base URL that violates the HTTPS policy is invalid
 * local configuration (exit 3), not invalid input.
 */
import {resolveBaseUrl} from '../base-url.js'
import {CliFailure, EXIT} from '../errors.js'
import {ProfileStore} from '../profile-store.js'
import {KeyringSecretStore} from '../secret-store.js'

export interface ApiContext {
  baseUrl: string
  clientId: string
  clientSecret: string
  tenantId: string
  /** Values that must never appear in any output. */
  redactionValues: string[]
}

/**
 * Failure constructors shared with `doctor`, which walks the same profile
 * checks one at a time. One constructor per condition keeps the code,
 * message, and exit category from drifting between the two callers.
 */
export function profileNotFoundFailure(profileName: string): CliFailure {
  return new CliFailure({
    code: 'profile-not-found',
    message:
      `The profile "${profileName}" does not exist. ` +
      'Create it with: intelligrc auth login --profile NAME --client-id ID',
    exitCode: EXIT.localConfiguration,
  })
}

export function profileIncompleteFailure(profileName: string): CliFailure {
  return new CliFailure({
    code: 'profile-incomplete',
    message:
      `The profile "${profileName}" is missing a client ID, tenant ID, or ` +
      'base URL. Recreate it with: intelligrc auth login --replace',
    exitCode: EXIT.localConfiguration,
  })
}

export function clientSecretMissingFailure(profileName: string): CliFailure {
  return new CliFailure({
    code: 'client-secret-missing',
    message:
      `No client secret exists for the profile "${profileName}" in the ` +
      'protected secret store. Recreate the profile with: ' +
      'intelligrc auth login --replace',
    exitCode: EXIT.localConfiguration,
  })
}

export function profileBaseUrlInvalidFailure(
  profileName: string,
  error: unknown,
): CliFailure {
  const detail = error instanceof CliFailure ? error.message : String(error)
  return new CliFailure({
    code: 'profile-base-url-invalid',
    message: `The resolved base URL for profile "${profileName}" is invalid: ${detail}`,
    exitCode: EXIT.localConfiguration,
  })
}

export function resolveApiContext(
  profileName: string,
  configDir: string,
  env: NodeJS.ProcessEnv,
): ApiContext {
  const profile = new ProfileStore(configDir).get(profileName)
  if (!profile) {
    throw profileNotFoundFailure(profileName)
  }

  const clientId = env.INTELLIGRC_CLIENT_ID ?? profile.clientId
  const tenantId = env.INTELLIGRC_TENANT_ID ?? profile.tenantId
  const baseUrlCandidate = env.INTELLIGRC_BASE_URL ?? profile.baseUrl

  if (!clientId || !tenantId || !baseUrlCandidate) {
    throw profileIncompleteFailure(profileName)
  }

  let baseUrl: string
  try {
    baseUrl = resolveBaseUrl(baseUrlCandidate, env)
  } catch (error) {
    throw profileBaseUrlInvalidFailure(profileName, error)
  }

  const clientSecret =
    env.INTELLIGRC_CLIENT_SECRET ?? new KeyringSecretStore().get(profileName)
  if (!clientSecret) {
    throw clientSecretMissingFailure(profileName)
  }

  return {
    baseUrl,
    clientId,
    clientSecret,
    tenantId,
    redactionValues: [clientId, clientSecret, tenantId],
  }
}
