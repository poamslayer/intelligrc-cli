import {Command} from '@oclif/core'

import {parseDataTypeId} from '../../api/filters.js'
import {apiDeleteDescription, runApiDelete} from '../../api/run-delete.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('data-type delete')

export default class DataTypeDelete extends Command {
  static override summary = spec.summary

  static override description = apiDeleteDescription(spec)

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DataTypeDelete)

    await runApiDelete(this, {
      spec,
      resource: 'data type',
      id: args.id as string,
      parseId: parseDataTypeId,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      yes: flags.yes === true,
    })
  }
}
