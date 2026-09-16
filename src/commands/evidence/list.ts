import {Command} from '@oclif/core'

import {filterQueryFromFlags} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {apiCommandSpec, selectContract} from '../../manifest.js'
import {oclifFlags} from '../../oclif-manifest.js'

const spec = apiCommandSpec('evidence list')

/**
 * The one variant this command can send. Reading it from the manifest keeps
 * the help text equal to the contract the command actually selects.
 */
const [evaluationVariant] = spec.variants ?? []

export default class EvidenceList extends Command {
  static override summary = spec.summary

  static override description =
    `${apiGetDescription(spec)} With ` +
    evaluationVariant.selectedBy.map((name) => `--${name}`).join(' or ') +
    `, sends the documented GET ${evaluationVariant.contract.path} request instead, ` +
    'with the supplied query parameters.'

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
