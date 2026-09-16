/** Resolve one effective identity from a profile, credentials file, or environment. */
import {resolve} from 'node:path'

import {DEFAULT_BASE_URL, resolveBaseUrl} from './base-url.js'
import {readCredentialsFile} from './credentials-file.js'
import {type EnvironmentVariables} from './environment.js'
import {CliFailure, EXIT} from './errors.js'
import {ProfileStore} from './profile-store.js'
import {FileSecretStore} from './secret-store.js'

export type IdentitySource = 'profile' | 'credentials-file' | 'environment'
export type SecretSource = 'secrets-file' | 'credentials-file' | 'environment'

export interface Identity {
  source: IdentitySource
  /** Present when source is "profile". */
  profile?: string
  /** Present when source is "credentials-file". */
  credentialsFile?: string
  clientId: string
  clientSecret: string
  tenantId: string
  tenantName: string | null
  baseUrl: string
  secretSource: SecretSource
  /** Environment variables that replaced a field of the base source. */
  overrides: string[]
}

/** Failure constructors also used by doctor for its profile-only checks. */
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
      'secrets file. Recreate the profile with: ' +
      'intelligrc auth login --replace',
    exitCode: EXIT.localConfiguration,
  })
}

export function profileBaseUrlInvalidFailure(
  profileName: string | undefined,
  error: unknown,
): CliFailure {
  const detail = error instanceof CliFailure ? error.message : String(error)
  return new CliFailure({
    code: 'profile-base-url-invalid',
    message: profileName
      ? `The resolved base URL for profile "${profileName}" is invalid: ${detail}`
      : `The resolved base URL is invalid: ${detail}`,
    exitCode: EXIT.localConfiguration,
  })
}

interface IdentityBase {
  source: IdentitySource
  profile?: string
  credentialsFile?: string
  clientId: string
  clientSecret: string
  tenantId: string
  tenantName: string | null
  baseUrl?: string
  secretSource: SecretSource
}

/**
 * Choose one identity source and apply the documented environment overrides.
 * A variable set to the empty string counts as unset everywhere: it does not
 * form the environment identity and it does not override a field.
 *
 * `baseDir` resolves a relative INTELLIGRC_CREDENTIALS_FILE path. The CLI
 * passes its working directory; a library caller passes whatever directory
 * relative paths should mean for it. This function never reads the working
 * directory itself.
 */
export function resolveIdentity(
  profileName: string | undefined,
  configDir: string,
  env: EnvironmentVariables,
  baseDir: string,
): Identity {
  const credentialsFile = nonEmpty(env.INTELLIGRC_CREDENTIALS_FILE)
  let base: IdentityBase

  if (credentialsFile) {
    if (profileName !== undefined) {
      throw new CliFailure({
        code: 'identity-source-conflict',
        message:
          'Pass --profile or set INTELLIGRC_CREDENTIALS_FILE, not both.',
        exitCode: EXIT.invalidInput,
      })
    }

    const fields = readCredentialsFile(credentialsFile, baseDir)
    base = {
      source: 'credentials-file',
      credentialsFile: resolve(baseDir, credentialsFile),
      clientId: fields.clientId,
      clientSecret: fields.clientSecret,
      tenantId: fields.tenantId,
      tenantName: fields.tenantName ?? null,
      baseUrl: fields.baseUrl,
      secretSource: 'credentials-file',
    }
  } else if (profileName !== undefined) {
    const profile = new ProfileStore(configDir).get(profileName)
    if (!profile) {
      throw profileNotFoundFailure(profileName)
    }

    if (!profile.clientId || !profile.tenantId || !profile.baseUrl) {
      throw profileIncompleteFailure(profileName)
    }

    const environmentSecret = nonEmpty(env.INTELLIGRC_CLIENT_SECRET)
    const clientSecret =
      environmentSecret ?? new FileSecretStore(configDir).get(profileName)
    if (!clientSecret) {
      throw clientSecretMissingFailure(profileName)
    }

    base = {
      source: 'profile',
      profile: profileName,
      clientId: profile.clientId,
      clientSecret,
      tenantId: profile.tenantId,
      tenantName: profile.tenantName ?? null,
      baseUrl: profile.baseUrl,
      secretSource: environmentSecret === undefined ? 'secrets-file' : 'environment',
    }
  } else {
    const clientId = nonEmpty(env.INTELLIGRC_CLIENT_ID)
    const clientSecret = nonEmpty(env.INTELLIGRC_CLIENT_SECRET)
    const tenantId = nonEmpty(env.INTELLIGRC_TENANT_ID)
    if (!clientId || !clientSecret || !tenantId) {
      throw new CliFailure({
        code: 'identity-required',
        message:
          'No identity was supplied. Pass --profile NAME, or set ' +
          'INTELLIGRC_CREDENTIALS_FILE, or set INTELLIGRC_CLIENT_ID, ' +
          'INTELLIGRC_CLIENT_SECRET, and INTELLIGRC_TENANT_ID together.',
        exitCode: EXIT.invalidInput,
      })
    }

    base = {
      source: 'environment',
      clientId,
      clientSecret,
      tenantId,
      tenantName: null,
      baseUrl: nonEmpty(env.INTELLIGRC_BASE_URL),
      secretSource: 'environment',
    }
  }

  const overrides: string[] = []
  if (base.source !== 'environment') {
    applyOverride(base, 'clientId', 'INTELLIGRC_CLIENT_ID', env, overrides)
    applyOverride(base, 'clientSecret', 'INTELLIGRC_CLIENT_SECRET', env, overrides)
    applyOverride(base, 'tenantId', 'INTELLIGRC_TENANT_ID', env, overrides)
    applyOverride(base, 'baseUrl', 'INTELLIGRC_BASE_URL', env, overrides)
    if (overrides.includes('INTELLIGRC_CLIENT_SECRET')) {
      base.secretSource = 'environment'
    }
  }

  let baseUrl: string
  try {
    baseUrl = resolveBaseUrl(base.baseUrl ?? DEFAULT_BASE_URL, env)
  } catch (error) {
    throw profileBaseUrlInvalidFailure(base.profile, error)
  }

  return {...base, baseUrl, overrides}
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value
}

function applyOverride(
  base: IdentityBase,
  field: 'clientId' | 'clientSecret' | 'tenantId' | 'baseUrl',
  variable: string,
  env: EnvironmentVariables,
  overrides: string[],
): void {
  const value = nonEmpty(env[variable])
  if (value !== undefined) {
    base[field] = value
    overrides.push(variable)
  }
}
