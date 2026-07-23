import {Command} from '@oclif/core'

import {parseIclVersionId} from '../../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {commandSpec, oclifFlags} from '../../../manifest.js'
import {type OutputFormat} from '../../../output.js'

const spec = commandSpec('lookup icl-version frameworks')
/** Documented path template; the identifier is validated and substituted. */
const PATH = '/v1/lookups/iclversions/{iclVersionId}/frameworks'

export default class LookupIclVersionFrameworks extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec, PATH)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(LookupIclVersionFrameworks)

    await runApiGet(this, {
      spec,
      path: PATH,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildPath: () =>
        PATH.replace(
          '{iclVersionId}',
          parseIclVersionId(flags['icl-version-id'] as string),
        ),
      sendTenantHeader: true,
    })
  }
}
