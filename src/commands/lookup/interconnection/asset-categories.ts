import {Command} from '@oclif/core'

import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {apiCommandSpec, oclifFlags} from '../../../manifest.js'
import {type OutputFormat} from '../../../output.js'

const spec = apiCommandSpec('lookup interconnection asset-categories')

export default class LookupInterconnectionAssetCategories extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(LookupInterconnectionAssetCategories)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
    })
  }
}
