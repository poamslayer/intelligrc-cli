import {Command} from '@oclif/core'

import {buildDataTypeIdsBody, parseFacilityId} from '../../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../../api/run-write.js'
import {apiCommandSpec} from '../../../manifest.js'
import {oclifArgs, oclifFlags} from '../../../oclif-manifest.js'

const spec = apiCommandSpec('facility data-types set')

export default class FacilityDataTypesSet extends Command {
  static override summary = spec.summary

  static override description =
    `${apiWriteDescription(spec, 'PUT')} The request replaces the complete set ` +
    'of data types associated with the facility, so the flags you pass become ' +
    'the whole list. Omit every --data-type-id to clear all associations.'

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FacilityDataTypesSet)

    await runApiWrite(this, {
      spec,
      method: 'PUT',
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
      buildBody: () => buildDataTypeIdsBody(flags),
      buildPath: () => spec.contract.path.replace('{id}', parseFacilityId(args.id as string)),
    })
  }
}
