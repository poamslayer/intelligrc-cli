import {Command} from '@oclif/core'

import {buildFacilityWriteBody, parseFacilityId} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'

const spec = apiCommandSpec('facility update')

export default class FacilityUpdate extends Command {
  static override summary = spec.summary

  static override description = apiWriteDescription(spec, 'PUT')

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FacilityUpdate)

    await runApiWrite(this, {
      spec,
      method: 'PUT',
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
      buildBody: () => buildFacilityWriteBody(flags),
      buildPath: () => spec.contract.path.replace('{id}', parseFacilityId(args.id as string)),
    })
  }
}
