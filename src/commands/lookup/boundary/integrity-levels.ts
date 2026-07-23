import {Command} from '@oclif/core'

import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {commandSpec, oclifFlags} from '../../../manifest.js'
import {type OutputFormat} from '../../../output.js'

const spec = commandSpec('lookup boundary integrity-levels')
const PATH = '/v1/lookups/boundaries/integritylevels'

export default class LookupBoundaryIntegrityLevels extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec, PATH)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(LookupBoundaryIntegrityLevels)

    await runApiGet(this, {
      spec,
      path: PATH,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
    })
  }
}
