import {Command} from '@oclif/core'

import {
  buildAssessmentObjectiveIdsBody,
  evidenceAssessmentObjectivesQueryFromFlags,
  parseEvidenceId,
} from '../../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../../api/run-write.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../../manifest.js'
import {type OutputFormat} from '../../../output.js'

const spec = apiCommandSpec('evidence assessment-objectives set')

export default class EvidenceAssessmentObjectivesSet extends Command {
  static override summary = spec.summary

  static override description =
    `${apiWriteDescription(spec, 'PUT')} By default the request replaces every ` +
    'assessment objective mapped to the evidence with the objectives you pass. ' +
    'Pass --preserve-existing true to add the objectives to the existing ' +
    'mappings instead of replacing them.'

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EvidenceAssessmentObjectivesSet)

    await runApiWrite(this, {
      spec,
      method: 'PUT',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
      buildBody: () => buildAssessmentObjectiveIdsBody(flags),
      buildQuery: () => evidenceAssessmentObjectivesQueryFromFlags(flags),
      buildPath: () => spec.contract.path.replace('{id}', parseEvidenceId(args.id as string)),
    })
  }
}
