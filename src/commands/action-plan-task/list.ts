import {Command} from '@oclif/core'

import {actionPlanQueryFromFlags} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {commandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = commandSpec('action-plan-task list')
const PATH = '/v1/ActionPlanTasks'

export default class ActionPlanTaskList extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec, PATH)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(ActionPlanTaskList)

    await runApiGet(this, {
      spec,
      path: PATH,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildQuery: () => actionPlanQueryFromFlags(flags),
      sendTenantHeader: true,
    })
  }
}
