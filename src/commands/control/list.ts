import {Command} from '@oclif/core'

import {filterQueryFromFlags} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'

const spec = apiCommandSpec('control list')

export default class ControlList extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(ControlList)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      flags,
      buildQuery: () => filterQueryFromFlags(flags),
      sendTenantHeader: true,
    })
  }
}
