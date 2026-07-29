import {Command} from '@oclif/core'

import {confirmDelete, deletedRecord} from '../../api/confirm-delete.js'
import {parsePersonnelId} from '../../api/filters.js'
import {apiDeleteDescription, runApiWrite} from '../../api/run-write.js'
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

    await runApiWrite(this, {
      spec,
      method: 'DELETE',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
      // Validate the identifier once. buildPath runs before the confirmation,
      // so a bad identifier exits 2 and never reaches the prompt; confirm and
      // onNoContent reuse the same validated value.
      buildPath: () => {
        const id = parsePersonnelId(args.id as string)
        this.personnelId = id
        return spec.contract.path.replace('{id}', id)
      },
      confirm: () => confirmDelete('person', this.personnelId, flags.yes === true),
      onNoContent: () => deletedRecord('person', this.personnelId),
    })
  }

  /** The validated personnel identifier, set by buildPath before confirm runs. */
  private personnelId = ''
}
