import {Command} from '@oclif/core'

import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {apiCommandSpec, oclifFlags} from '../../../manifest.js'
import {type OutputFormat} from '../../../output.js'

const spec = apiCommandSpec('lookup icl-version list')

export default class LookupIclVersionList extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(LookupIclVersionList)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
    })
  }
}
