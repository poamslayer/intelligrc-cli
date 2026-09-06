import {Command} from '@oclif/core'

import {buildAssessmentObjectiveUpdateBody, parseAssessmentObjectiveId} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'

const spec = apiCommandSpec('assessment-objective update')

export default class AssessmentObjectiveUpdate extends Command {
  static override summary = spec.summary

  static override description =
    `${apiWriteDescription(spec, 'PUT')} The update is partial: each field is ` +
    'sent only when you supply its flag, so an omitted flag is left out of the ' +
    'request body.'

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(AssessmentObjectiveUpdate)

    await runApiWrite(this, {
      spec,
      method: 'PUT',
      profile: flags.profile as string,
      flags,
      sendTenantHeader: true,
      buildBody: () => buildAssessmentObjectiveUpdateBody(flags),
      buildPath: () =>
        spec.contract.path.replace('{id}', parseAssessmentObjectiveId(args.id as string)),
    })
  }
}
