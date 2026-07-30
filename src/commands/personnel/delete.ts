import {Command} from '@oclif/core'

import {parsePersonnelId} from '../../api/filters.js'
import {apiDeleteDescription, runApiDelete} from '../../api/run-delete.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('personnel delete')

export default class PersonnelDelete extends Command {
  static override summary = spec.summary

  static override description =
    `${apiDeleteDescription(spec)} The documented operation replies 409 ` +
    'Conflict when another record references the person, for example as the ' +
    'authorizing official of an interconnection. The command passes that ' +
    'reply through with the message the API returned.'

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PersonnelDelete)

    await runApiDelete(this, {
      spec,
      resource: 'person',
      id: args.id as string,
      parseId: parsePersonnelId,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      yes: flags.yes === true,
    })
  }
}
