import {Command} from '@oclif/core'

import {parseIclVersionId} from '../../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {apiCommandSpec, oclifFlags} from '../../../manifest.js'
import {type OutputFormat} from '../../../output.js'

const spec = apiCommandSpec('lookup icl-version frameworks')

export default class LookupIclVersionFrameworks extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(LookupIclVersionFrameworks)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildPath: () =>
        spec.contract.path.replace(
          '{iclVersionId}',
          parseIclVersionId(flags['icl-version-id'] as string),
        ),
      sendTenantHeader: true,
    })
  }
}
