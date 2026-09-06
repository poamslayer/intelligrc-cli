/**
 * Shared command runner for the documented delete operations, a thin
 * composition over the write runner. One call runs the whole sequence for one
 * DELETE: validate the identifier argument, pause for confirmation, send the
 * guarded request, and print the deletion confirmation the 204 reply carries no
 * body for.
 *
 * A delete cannot be undone, so every delete command applies the same
 * confirmation rule:
 *
 * - `--force` skips the pause.
 * - With a terminal attached, an affirmative answer proceeds and any other
 *   answer, including a bare Enter, declines.
 * - With no terminal attached and `--force` absent, the command declines.
 *
 * A declined delete throws a CliFailure, so no request is sent and the command
 * exits 2 (invalid input). The prompt writes to stderr, so stdout carries only
 * the deletion confirmation on success.
 */
import {type Command} from '@oclif/core'

import {CliFailure, EXIT} from '../errors.js'
import {type ApiCommandSpec} from '../manifest.js'
import {promptConfirm, type PromptInput} from '../prompt.js'
import {apiWriteDescription, runApiWrite} from './run-write.js'

/** A prompt output stream, which reports whether a terminal is attached. */
interface ConfirmOutput extends NodeJS.WritableStream {
  isTTY?: boolean
}

/**
 * Shared help description for one documented delete operation. It states the
 * write facts and then the confirmation rule, so the help text and the runner
 * never drift apart.
 */
export function apiDeleteDescription(spec: ApiCommandSpec): string {
  return (
    `${apiWriteDescription(spec, 'DELETE')} Because a delete cannot be undone, ` +
    'the command pauses and asks for confirmation, defaulting to "no" on an ' +
    'empty answer. Add --force to skip the pause. When no terminal is attached ' +
    'and --force is absent, the command declines rather than deleting.'
  )
}

export interface ApiDeleteOptions {
  spec: ApiCommandSpec
  /**
   * The kind of record, in plain words, for example "data type" or "person".
   * It names the record in the confirmation prompt, in a declined-delete
   * message, and in the printed deletion confirmation.
   */
  resource: string
  /** The identifier argument as the user typed it. */
  id: string
  /**
   * Validates the identifier argument and returns its canonical form, for
   * example parsePersonnelId. It runs before the confirmation, so a bad
   * identifier exits 2 without a prompt, a keyring read, or a request.
   */
  parseId: (raw: string) => string
  profile: string
  /** The command's parsed flags. See the note in ApiGetOptions. */
  flags: Record<string, unknown>
  /** True when --force was given, which skips the confirmation pause. */
  force: boolean
}

export async function runApiDelete(command: Command, options: ApiDeleteOptions): Promise<void> {
  // The canonical identifier, produced while the path is built and reused by
  // the confirmation and the printed result, so it is validated exactly once.
  let id = ''

  await runApiWrite(command, {
    spec: options.spec,
    method: 'DELETE',
    profile: options.profile,
    flags: options.flags,
    sendTenantHeader: true,
    buildPath: () => {
      id = options.parseId(options.id)
      return options.spec.contract.path.replace('{id}', id)
    },
    confirm: () => confirmDelete(options.resource, id, options.force),
    // The identifier is a JSON number, matching the documented integer path
    // parameter the command sent.
    onNoContent: () => ({deleted: {resource: options.resource, id: Number(id)}}),
  })
}

/**
 * Pause and confirm before a delete, following the rule stated at the top of
 * this module. `id` is the validated identifier the command will send.
 * Resolves to proceed; throws a CliFailure to decline.
 *
 * The two streams default to the real process streams and are parameters for
 * the same reason promptConfirm takes them: a test supplies a pair of fake
 * streams and drives either answer without a terminal.
 */
export async function confirmDelete(
  resource: string,
  id: string,
  skip: boolean,
  input: PromptInput = process.stdin,
  output: ConfirmOutput = process.stderr,
): Promise<void> {
  if (skip) {
    return
  }

  if (input.isTTY && output.isTTY) {
    const proceed = await promptConfirm(
      input,
      output,
      `Delete ${resource} ${id}? This cannot be undone. Type "y" to confirm [y/N]: `,
    )
    if (!proceed) {
      throw new CliFailure({
        code: 'delete-declined',
        message: `The deletion of ${resource} ${id} was not confirmed, so no request was sent.`,
        exitCode: EXIT.invalidInput,
      })
    }

    return
  }

  throw new CliFailure({
    code: 'delete-confirmation-unavailable',
    message:
      `No terminal is attached to confirm deleting ${resource} ${id}. ` +
      'Re-run with --force to delete without a prompt. No request was sent.',
    exitCode: EXIT.invalidInput,
  })
}
