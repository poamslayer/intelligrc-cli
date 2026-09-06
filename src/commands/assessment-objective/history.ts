import {Command} from '@oclif/core'

import {type QueryPairs} from '../../api/client.js'
import {parseAssessmentObjectiveId, parseEvaluationId} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'

const spec = apiCommandSpec('assessment-objective history')

export default class AssessmentObjectiveHistory extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(AssessmentObjectiveHistory)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      flags,
      buildQuery: (): QueryPairs => {
        const query: QueryPairs = [
          [
            'assessmentObjectiveId',
            parseAssessmentObjectiveId(flags['assessment-objective-id'] as string),
          ],
        ]
        const evaluationId = flags['evaluation-id'] as string | undefined
        if (evaluationId !== undefined) {
          query.push(['evaluationId', parseEvaluationId(evaluationId)])
        }

        return query
      },
      sendTenantHeader: true,
    })
  }
}
