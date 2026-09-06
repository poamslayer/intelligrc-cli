import {Command} from '@oclif/core'

import {buildPersonnelWriteBody, parsePersonnelId} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'

const spec = apiCommandSpec('personnel update')

export default class PersonnelUpdate extends Command {
  static override summary = spec.summary

  static override description = apiWriteDescription(spec, 'PUT')

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PersonnelUpdate)

    await runApiWrite(this, {
      spec,
      method: 'PUT',
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
      buildBody: () => buildPersonnelWriteBody(flags),
      buildPath: () => spec.contract.path.replace('{id}', parsePersonnelId(args.id as string)),
    })
  }
}
