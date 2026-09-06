import {Command} from '@oclif/core'

import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {apiCommandSpec, oclifFlags} from '../../../manifest.js'

const spec = apiCommandSpec('lookup action-plan levels-of-effort')

export default class LookupActionPlanLevelsOfEffort extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(LookupActionPlanLevelsOfEffort)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
    })
  }
}
