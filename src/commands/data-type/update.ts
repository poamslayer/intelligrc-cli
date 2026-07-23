import {Command} from '@oclif/core'

import {buildDataTypeBody, parseDataTypeId} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('data-type update')

export default class DataTypeUpdate extends Command {
  static override summary = spec.summary

  static override description = apiWriteDescription(spec, 'PUT')

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DataTypeUpdate)

    await runApiWrite(this, {
      spec,
      method: 'PUT',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
      buildBody: () => buildDataTypeBody(flags),
      buildPath: () => spec.contract.path.replace('{id}', parseDataTypeId(args.id as string)),
    })
  }
}
