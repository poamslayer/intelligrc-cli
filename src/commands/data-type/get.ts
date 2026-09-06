import {Command} from '@oclif/core'

import {parseDataTypeId} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'

const spec = apiCommandSpec('data-type get')

export default class DataTypeGet extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DataTypeGet)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      flags,
      buildPath: () => spec.contract.path.replace('{id}', parseDataTypeId(args.id as string)),
      sendTenantHeader: true,
    })
  }
}
