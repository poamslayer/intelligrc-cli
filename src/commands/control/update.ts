import {Command} from '@oclif/core'

import {buildControlUpdateBody, parseControlId} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('control update')

export default class ControlUpdate extends Command {
  static override summary = spec.summary

  static override description =
    `${apiWriteDescription(spec, 'PUT')} The update is partial: each field is ` +
    'sent only when you supply its flag, so an omitted flag is left out of the ' +
    'request body. When you omit --evaluation-id, the API updates the control ' +
    'within the current evaluation.'

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ControlUpdate)

    await runApiWrite(this, {
      spec,
      method: 'PUT',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
      buildBody: () => buildControlUpdateBody(flags),
      buildPath: () =>
        spec.contract.path.replace('{controlId}', parseControlId(args.id as string)),
    })
  }
}
