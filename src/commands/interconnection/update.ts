import {Command} from '@oclif/core'

import {buildInterconnectionUpdateBody, parseInterconnectionId} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'

const spec = apiCommandSpec('interconnection update')

export default class InterconnectionUpdate extends Command {
  static override summary = spec.summary

  static override description = apiWriteDescription(spec, 'PUT')

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(InterconnectionUpdate)

    await runApiWrite(this, {
      spec,
      method: 'PUT',
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
      buildBody: () => buildInterconnectionUpdateBody(flags),
      buildPath: () => spec.contract.path.replace('{id}', parseInterconnectionId(args.id as string)),
    })
  }
}
