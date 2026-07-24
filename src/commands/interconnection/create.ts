import {Command} from '@oclif/core'

import {buildInterconnectionCreateBody} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('interconnection create')

export default class InterconnectionCreate extends Command {
  static override summary = spec.summary

  static override description = apiWriteDescription(spec, 'POST')

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(InterconnectionCreate)

    await runApiWrite(this, {
      spec,
      method: 'POST',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
      buildBody: () => buildInterconnectionCreateBody(flags),
    })
  }
}
