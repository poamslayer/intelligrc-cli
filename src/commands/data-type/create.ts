import {Command} from '@oclif/core'

import {buildDataTypeBody} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec} from '../../manifest.js'
import {oclifFlags} from '../../oclif-manifest.js'

const spec = apiCommandSpec('data-type create')

export default class DataTypeCreate extends Command {
  static override summary = spec.summary

  static override description = apiWriteDescription(spec, 'POST')

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(DataTypeCreate)

    await runApiWrite(this, {
      spec,
      method: 'POST',
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
      buildBody: () => buildDataTypeBody(flags),
    })
  }
}
