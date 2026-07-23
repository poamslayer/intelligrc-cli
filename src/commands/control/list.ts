import {Command} from '@oclif/core'

import {buildFilterQuery} from '../../api/filters.js'
import {runApiGet} from '../../api/run-get.js'
import {commandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = commandSpec('control list')

export default class ControlList extends Command {
  static override summary = spec.summary

  static override description =
    'Sends one documented GET /v1/Controls request with the profile ' +
    'credential and tenant. Documented permission: ' +
    `"${spec.permission}". The CLI does not check whether the selected ` +
    'profile holds it. Output preserves the upstream field names and ' +
    'response shape.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(ControlList)

    await runApiGet(this, {
      spec,
      path: '/v1/Controls',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildQuery: () =>
        buildFilterQuery(
          flags['evaluation-id'] as string | undefined,
          flags['framework-id'] as string | undefined,
        ),
      sendTenantHeader: true,
    })
  }
}
