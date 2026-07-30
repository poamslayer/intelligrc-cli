/**
 * Unit tests for the shared delete confirmation, the rule every delete command
 * applies before it sends a request. The process-level suites cover the two
 * paths that need no terminal — `--yes` skips the pause, and a session with no
 * terminal declines — so these tests drive the two answers a terminal supplies:
 * an affirmative answer proceeds, and an empty answer declines and sends no
 * request. The confirmation takes its streams as parameters, exactly like
 * promptConfirm, so a pair of fake terminal streams stands in for a real one.
 */
import assert from 'node:assert/strict'
import {PassThrough} from 'node:stream'
import {test} from 'node:test'

import {confirmDelete} from '../dist/api/run-delete.js'

/** A fake stream pair that reports itself as a terminal, plus the bytes written. */
function terminalStreams(): {
  input: PassThrough & {isTTY?: boolean}
  output: PassThrough & {isTTY?: boolean}
  written: () => string
} {
  const input = Object.assign(new PassThrough(), {isTTY: true})
  const output = Object.assign(new PassThrough(), {isTTY: true})
  let text = ''
  output.on('data', (chunk: Buffer) => {
    text += chunk.toString('utf8')
  })
  return {input, output, written: () => text}
}

test('an affirmative answer confirms the delete and names the record in the prompt', async () => {
  const {input, output, written} = terminalStreams()

  const pending = confirmDelete('person', '12', false, input, output)
  input.write('y\n')

  await pending
  assert.equal(written(), 'Delete person 12? This cannot be undone. Type "y" to confirm [y/N]: ')
})

test('an empty answer declines the delete, so the caller sends no request', async () => {
  const {input, output} = terminalStreams()

  const pending = confirmDelete('person', '12', false, input, output)
  input.write('\n')

  await assert.rejects(pending, (error: {code?: string; exitCode?: number; message?: string}) => {
    assert.equal(error.code, 'delete-declined')
    assert.equal(error.exitCode, 2)
    assert.match(String(error.message), /person 12 was not confirmed/)
    return true
  })
})

test('any non-affirmative answer declines the delete', async () => {
  for (const answer of ['n', 'no', 'nope', 'delete']) {
    const {input, output} = terminalStreams()

    const pending = confirmDelete('data type', '42', false, input, output)
    input.write(`${answer}\n`)

    await assert.rejects(
      pending,
      (error: {code?: string}) => error.code === 'delete-declined',
      `answer "${answer}" must decline`,
    )
  }
})

test('--yes skips the pause, so nothing is written and no answer is read', async () => {
  const {input, output, written} = terminalStreams()

  await confirmDelete('data type', '42', true, input, output)

  assert.equal(written(), '')
})

test('a session with no terminal declines and explains how to delete without a prompt', async () => {
  const input = new PassThrough()
  const output = new PassThrough()

  await assert.rejects(
    confirmDelete('person', '12', false, input, output),
    (error: {code?: string; exitCode?: number; message?: string}) => {
      assert.equal(error.code, 'delete-confirmation-unavailable')
      assert.equal(error.exitCode, 2)
      assert.match(String(error.message), /--yes/)
      return true
    },
  )
})
