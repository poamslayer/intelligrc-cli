import {Command} from '@oclif/core'

import {runApiGet} from '../../api/run-get.js'
import {commandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = commandSpec('evaluation current')

export default class EvaluationCurrent extends Command {
  static override summary = spec.summary

  static override description =
    'Sends one documented GET /v1/Evaluations/Current request with the ' +
    'profile credential and tenant. Documented permission: ' +
    `"${spec.permission}". The CLI does not check whether the selected ` +
    'profile holds it. Output preserves the upstream field names and ' +
    'response shape.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(EvaluationCurrent)

    await runApiGet(this, {
      spec,
      path: '/v1/Evaluations/Current',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
    })
  }
}
