import {Command} from '@oclif/core'

import {resolveBaseUrl} from '../../base-url.js'
import {discoverTenants} from '../../discovery.js'
import {CliFailure, EXIT, emitFailure} from '../../errors.js'
import {commandSpec, oclifFlags} from '../../manifest.js'
import {ProfileStore, type ProfileSettings} from '../../profile-store.js'
import {KeyringSecretStore} from '../../secret-store.js'

const spec = commandSpec('auth login')

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export default class AuthLogin extends Command {
  static override summary = spec.summary

  static override description =
    'Reads the client secret from a masked prompt or from the environment ' +
    'variable named by --client-secret-env, discovers the assigned tenant ' +
    'from the documented tenant-list operation, and saves the profile only ' +
    'when exactly one tenant returns. The secret is stored in the operating ' +
    'system protected secret store, never in a configuration file.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    // Reject any client-secret value flag before oclif can echo the value
    // in a parse error. The message never contains the attempted value.
    for (const token of this.argv) {
      if (token === '--client-secret' || token.startsWith('--client-secret=')) {
        const exitCode = emitFailure(
          new CliFailure({
            code: 'client-secret-flag-rejected',
            message:
              'A client-secret value flag is not supported, so the secret ' +
              'cannot reach shell history or process listings. Use ' +
              '--client-secret-env VARIABLE or the masked prompt.',
            exitCode: EXIT.invalidInput,
          }),
          [],
        )
        this.exit(exitCode)
      }
    }

    const {flags} = await this.parse(AuthLogin)

    const secrets: string[] = []
    try {
      const profileName = flags.profile as string
      const clientId = flags['client-id'] as string

      if (!PROFILE_NAME_PATTERN.test(profileName)) {
        throw new CliFailure({
          code: 'profile-name-invalid',
          message:
            'The profile name must start with a letter or digit and may ' +
            'contain only letters, digits, ".", "_", and "-".',
          exitCode: EXIT.invalidInput,
        })
      }

      const baseUrl = resolveBaseUrl(flags['base-url'] as string | undefined, process.env)

      const profileStore = new ProfileStore(this.config.configDir)
      const existing = profileStore.get(profileName)
      if (existing && !flags.replace) {
        throw new CliFailure({
          code: 'profile-exists',
          message:
            `The profile "${profileName}" already exists. ` +
            'Run login again with --replace to overwrite it.',
          exitCode: EXIT.localConfiguration,
        })
      }

      const clientSecret = this.acquireSecret(
        flags['client-secret-env'] as string | undefined,
      )
      secrets.push(clientSecret)

      const tenants = await discoverTenants(baseUrl, clientId, clientSecret)
      if (tenants.length === 0) {
        throw new CliFailure({
          code: 'tenant-discovery-empty',
          message:
            'Tenant discovery returned zero tenants for this credential. ' +
            'No profile was saved.',
          exitCode: EXIT.apiFailure,
        })
      }

      if (tenants.length > 1) {
        throw new CliFailure({
          code: 'tenant-discovery-multiple',
          message:
            `Tenant discovery returned ${tenants.length} tenants. The CLI ` +
            'does not guess a tenant assignment. No profile was saved.',
          exitCode: EXIT.apiFailure,
        })
      }

      const tenant = tenants[0]
      const settings: ProfileSettings = {
        clientId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        baseUrl,
        createdAt: new Date().toISOString(),
      }

      const secretStore = new KeyringSecretStore()
      // Read the prior secret before any write so a failed replacement can
      // restore it.
      const priorSecret = existing ? secretStore.get(profileName) : null

      secretStore.set(profileName, clientSecret)
      try {
        profileStore.upsert(profileName, settings)
      } catch (error) {
        this.rollbackSecret(secretStore, profileName, existing !== undefined, priorSecret)
        throw error
      }

      this.log(
        JSON.stringify(
          {
            name: profileName,
            clientId,
            tenantId: tenant.id,
            tenantName: tenant.name,
            baseUrl,
          },
          null,
          2,
        ),
      )
    } catch (error) {
      this.exit(emitFailure(error, secrets))
    }
  }

  private acquireSecret(secretEnvName: string | undefined): string {
    if (secretEnvName) {
      const value = process.env[secretEnvName]
      if (!value) {
        throw new CliFailure({
          code: 'client-secret-env-missing',
          message:
            `The environment variable "${secretEnvName}" named by ` +
            '--client-secret-env is not set or is empty.',
          exitCode: EXIT.localConfiguration,
        })
      }

      return value
    }

    throw new CliFailure({
      code: 'client-secret-prompt-unavailable',
      message:
        'No terminal is attached for the masked client-secret prompt. ' +
        'Use --client-secret-env VARIABLE for headless login.',
      exitCode: EXIT.invalidInput,
    })
  }

  /**
   * Undo the secret write after a failed configuration write. A failed
   * restore surfaces the exact component that requires repair.
   */
  private rollbackSecret(
    secretStore: KeyringSecretStore,
    profileName: string,
    hadProfile: boolean,
    priorSecret: string | null,
  ): void {
    try {
      if (hadProfile && priorSecret !== null) {
        secretStore.set(profileName, priorSecret)
      } else {
        secretStore.delete(profileName)
      }
    } catch {
      throw new CliFailure({
        code: 'rollback-failed',
        message:
          'Writing profiles.json failed and the protected secret entry ' +
          `for profile "${profileName}" (service "intelligrc-cli") could ` +
          'not be restored. Repair that secret store entry manually.',
        exitCode: EXIT.localConfiguration,
      })
    }
  }
}
