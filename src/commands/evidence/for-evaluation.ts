import {Command} from '@oclif/core'

import {filterQueryFromFlags} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('evidence for-evaluation')

export default class EvidenceForEvaluation extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(EvidenceForEvaluation)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildQuery: () => filterQueryFromFlags(flags),
      sendTenantHeader: true,
    })
  }
}
