/**
 * Shared confirmation pause and result shape for the documented delete
 * operations. A delete cannot be undone, so every delete command pauses and
 * asks before it sends the request. The rule is the same for every resource:
 *
 * - `--yes` skips the pause.
 * - With a terminal attached, an affirmative answer proceeds and any other
 *   answer, including a bare Enter, declines.
 * - With no terminal attached and `--yes` absent, the command declines.
 *
 * A declined delete throws a CliFailure, so the write runner sends no request
 * and exits 2 (invalid input). The prompt writes to stderr, so stdout carries
 * only the deletion confirmation on success.
 */
import {CliFailure, EXIT} from '../errors.js'
import {promptConfirm} from '../prompt.js'

/**
 * Pause and confirm before a delete. `resource` names the kind of record in
 * plain words, for example "data type" or "person"; `id` is the validated
 * identifier the command will send. Resolves to proceed; throws to decline.
 */
export async function confirmDelete(resource: string, id: string, skip: boolean): Promise<void> {
  if (skip) {
    return
  }

  if (process.stdin.isTTY && process.stderr.isTTY) {
    const proceed = await promptConfirm(
      process.stdin,
      process.stderr,
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
      'Re-run with --yes to delete without a prompt. No request was sent.',
    exitCode: EXIT.invalidInput,
  })
}

/**
 * The object a delete command prints when the API replies 204 with no body.
 * The identifier is a JSON number, matching the documented integer path
 * parameter the command sent.
 */
export function deletedRecord(resource: string, id: string): {deleted: {resource: string; id: number}} {
  return {deleted: {resource, id: Number(id)}}
}
