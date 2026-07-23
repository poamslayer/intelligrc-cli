import {Command} from '@oclif/core'

import {parseFacilityId} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {commandSpec, oclifArgs, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = commandSpec('facility data-types')
/** Documented path template; the identifier is validated and substituted. */
const PATH = '/v1/Facilities/{id}/datatypes'

export default class FacilityDataTypes extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec, PATH)

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FacilityDataTypes)

    await runApiGet(this, {
      spec,
      path: PATH,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildPath: () => PATH.replace('{id}', parseFacilityId(args.id as string)),
      sendTenantHeader: true,
    })
  }
}
