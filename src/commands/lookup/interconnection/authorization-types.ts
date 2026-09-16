import {Command} from '@oclif/core'

import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {apiCommandSpec} from '../../../manifest.js'
import {oclifFlags} from '../../../oclif-manifest.js'

const spec = apiCommandSpec('lookup interconnection authorization-types')

export default class LookupInterconnectionAuthorizationTypes extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(LookupInterconnectionAuthorizationTypes)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
    })
  }
}
