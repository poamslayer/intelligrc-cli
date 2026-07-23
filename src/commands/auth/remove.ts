import {Command} from '@oclif/core'

import {CliFailure, EXIT, emitFailure} from '../../errors.js'
import {commandSpec, oclifFlags} from '../../manifest.js'
import {ProfileStore} from '../../profile-store.js'
import {KeyringSecretStore} from '../../secret-store.js'

const spec = commandSpec('auth remove')

export default class AuthRemove extends Command {
  static override summary = spec.summary

  static override description =
    'Deletes the named profile from profiles.json and its client secret ' +
    'from the protected secret store. Runs locally and never changes ' +
    'IntelliGRC tenant data.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthRemove)

    try {
      const profileName = flags.profile as string
      const profileStore = new ProfileStore(this.config.configDir)

      if (!profileStore.get(profileName)) {
        throw new CliFailure({
          code: 'profile-not-found',
          message: `The profile "${profileName}" does not exist.`,
          exitCode: EXIT.localConfiguration,
        })
      }

      // Delete the secret first. When that fails, the profile stays in
      // profiles.json so the administrator can repair the store and retry.
      // A missing entry is not a failure: removal then repairs a profile
      // whose secret is already gone.
      const secretStore = new KeyringSecretStore()
      const secretExisted = secretStore.delete(profileName)

      profileStore.remove(profileName)

      this.log(JSON.stringify({removed: profileName, secretExisted}, null, 2))
    } catch (error) {
      this.exit(emitFailure(error, []))
    }
  }
}
