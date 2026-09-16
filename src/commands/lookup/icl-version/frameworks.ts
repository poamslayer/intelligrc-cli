import {Command} from '@oclif/core'

import {parseIclVersionId} from '../../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {apiCommandSpec} from '../../../manifest.js'
import {oclifFlags} from '../../../oclif-manifest.js'

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
      flags,
      buildPath: () =>
        spec.contract.path.replace(
          '{iclVersionId}',
          parseIclVersionId(flags['icl-version-id'] as string),
        ),
      sendTenantHeader: true,
    })
  }
}
