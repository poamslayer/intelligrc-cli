import {Command} from '@oclif/core'

import {parseDataTypeId} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {CliFailure, EXIT} from '../../errors.js'
import {apiCommandSpec, oclifArgs, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'
import {promptConfirm} from '../../prompt.js'

const spec = apiCommandSpec('data-type delete')

export default class DataTypeDelete extends Command {
  static override summary = spec.summary

  static override description =
    `${apiWriteDescription(spec, 'DELETE')} Because a delete cannot be undone, ` +
    'the command pauses and asks for confirmation, defaulting to "no" on an ' +
    'empty answer. Add --yes to skip the pause. When no terminal is attached ' +
    'and --yes is absent, the command declines rather than deleting.'

  static override enableJsonFlag = false

  static override args = oclifArgs(spec)

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {args, flags} = await this.parse(DataTypeDelete)

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
        const id = parseDataTypeId(args.id as string)
        this.dataTypeId = id
        return spec.contract.path.replace('{id}', id)
      },
      confirm: () => this.confirmDeletion(this.dataTypeId, flags.yes === true),
      onNoContent: () => ({deleted: {resource: 'data type', id: Number(this.dataTypeId)}}),
    })
  }

  /** The validated data-type identifier, set by buildPath before confirm runs. */
  private dataTypeId = ''

  /**
   * Pause and confirm before a delete. Resolves to proceed; throws a
   * CliFailure to decline so no request is sent. The prompt writes to stderr,
   * so stdout carries only the deletion confirmation on success.
   */
  private async confirmDeletion(id: string, skip: boolean): Promise<void> {
    if (skip) {
      return
    }

    if (process.stdin.isTTY && process.stderr.isTTY) {
      const proceed = await promptConfirm(
        process.stdin,
        process.stderr,
        `Delete data type ${id}? This cannot be undone. Type "y" to confirm [y/N]: `,
      )
      if (!proceed) {
        throw new CliFailure({
          code: 'delete-declined',
          message: `The deletion of data type ${id} was not confirmed, so no request was sent.`,
          exitCode: EXIT.invalidInput,
        })
      }

      return
    }

    throw new CliFailure({
      code: 'delete-confirmation-unavailable',
      message:
        `No terminal is attached to confirm deleting data type ${id}. ` +
        'Re-run with --yes to delete without a prompt. No request was sent.',
      exitCode: EXIT.invalidInput,
    })
  }
}
