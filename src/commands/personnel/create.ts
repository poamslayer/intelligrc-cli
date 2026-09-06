import {Command} from '@oclif/core'

import {buildPersonnelWriteBody} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'

const spec = apiCommandSpec('personnel create')

export default class PersonnelCreate extends Command {
  static override summary = spec.summary

  static override description = apiWriteDescription(spec, 'POST')

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(PersonnelCreate)

    await runApiWrite(this, {
      spec,
      method: 'POST',
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
      buildBody: () => buildPersonnelWriteBody(flags),
    })
  }
}
