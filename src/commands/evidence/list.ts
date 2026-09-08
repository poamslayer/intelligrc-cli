import {Command} from '@oclif/core'

import {filterQueryFromFlags} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {apiCommandSpec, oclifFlags, selectContract} from '../../manifest.js'

const spec = apiCommandSpec('evidence list')

export default class EvidenceList extends Command {
  static override summary = spec.summary

  static override description =
    `${apiGetDescription(spec)} With --evaluation-id or --framework-id, sends the ` +
    'documented GET /v1/Evidence/Evaluation request instead, with the supplied query parameters.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(EvidenceList)
    const contract = selectContract(spec, flags)

    await runApiGet(this, {
      spec,
      contract,
      profile: flags.profile as string,
      flags,
      buildQuery: () => filterQueryFromFlags(flags),
      sendTenantHeader: true,
    })
  }
}
