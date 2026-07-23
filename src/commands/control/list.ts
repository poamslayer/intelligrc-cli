import {Command} from '@oclif/core'

import {filterQueryFromFlags} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {commandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = commandSpec('control list')
const PATH = '/v1/Controls'

export default class ControlList extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec, PATH)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(ControlList)

    await runApiGet(this, {
      spec,
      path: PATH,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildQuery: () => filterQueryFromFlags(flags),
      sendTenantHeader: true,
    })
  }
}
