import {Command} from '@oclif/core'

import {buildEvaluationCreateBody} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('evaluation create')

export default class EvaluationCreate extends Command {
  static override summary = spec.summary

  static override description = apiWriteDescription(spec, 'POST')

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(EvaluationCreate)

    await runApiWrite(this, {
      spec,
      method: 'POST',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
      buildBody: () => buildEvaluationCreateBody(flags),
    })
  }
}
