import {Command} from '@oclif/core'

import {parseFacilityId} from '../../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../../api/run-get.js'
import {apiCommandSpec} from '../../../manifest.js'
import {oclifArgs, oclifFlags} from '../../../oclif-manifest.js'

const spec = apiCommandSpec('facility data-types get')

export default class FacilityDataTypesGet extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FacilityDataTypesGet)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      flags,
      buildPath: () => spec.contract.path.replace('{id}', parseFacilityId(args.id as string)),
      sendTenantHeader: true,
    })
  }
}
