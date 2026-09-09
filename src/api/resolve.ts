/**
 * Configuration resolver for API commands. Resolves the effective identity
 * and maps it to the request context used by the guarded API client.
 */
import {resolveIdentity} from '../identity.js'
export {
  clientSecretMissingFailure,
  profileBaseUrlInvalidFailure,
  profileIncompleteFailure,
  profileNotFoundFailure,
} from '../identity.js'

export interface ApiContext {
  baseUrl: string
  clientId: string
  clientSecret: string
  tenantId: string
  /** Values that must never appear in any output. */
  redactionValues: string[]
}

export function resolveApiContext(
  profileName: string | undefined,
  configDir: string,
  env: NodeJS.ProcessEnv,
): ApiContext {
  const identity = resolveIdentity(profileName, configDir, env)

  return {
    baseUrl: identity.baseUrl,
    clientId: identity.clientId,
    clientSecret: identity.clientSecret,
    tenantId: identity.tenantId,
    redactionValues: [identity.clientId, identity.clientSecret, identity.tenantId],
  }
}
