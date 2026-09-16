import {Command} from '@oclif/core'

import {emitFailure} from '../../report.js'
import {commandSpec} from '../../manifest.js'
import {oclifFlags} from '../../oclif-manifest.js'
import {ProfileStore} from '../../profile-store.js'

const spec = commandSpec('auth list')

export default class AuthList extends Command {
  static override summary = spec.summary

  static override description =
    'Reads profiles.json only. Never reads the secrets file ' +
    'and never contacts a network service.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    await this.parse(AuthList)

    try {
      const profileStore = new ProfileStore(this.config.configDir)
      const {profiles} = profileStore.read()

      const rows = Object.entries(profiles)
        .map(([name, settings]) => ({
          name,
          clientId: settings.clientId,
          tenantId: settings.tenantId,
          tenantName: settings.tenantName,
          baseUrl: settings.baseUrl,
          createdAt: settings.createdAt,
        }))
        .sort((left, right) => left.name.localeCompare(right.name))

      this.log(JSON.stringify(rows, null, 2))
    } catch (error) {
      this.exit(emitFailure(error, []))
    }
  }
}
