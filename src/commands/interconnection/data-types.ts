import {Command} from '@oclif/core'

import {parseInterconnectionId} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('interconnection data-types')

export default class InterconnectionDataTypes extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InterconnectionDataTypes)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildPath: () => spec.contract.path.replace('{id}', parseInterconnectionId(args.id as string)),
      sendTenantHeader: true,
    })
  }
}
