import assert from 'node:assert/strict'
import {PassThrough} from 'node:stream'
import {test} from 'node:test'

import {promptConfirm, promptSecret} from '../dist/prompt.js'

const BACKSPACE = String.fromCharCode(127)
const CTRL_C = String.fromCharCode(3)

function collect(stream: PassThrough): () => string {
  let text = ''
  stream.on('data', (chunk: Buffer) => {
    text += chunk.toString('utf8')
  })
  return () => text
}

test('promptSecret captures the typed value without echoing it', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const written = collect(output)

  const pending = promptSecret(input, output)
  input.write('hunter2\n')

  const value = await pending
  assert.equal(value, 'hunter2')
  // The prompt text and the final newline are the only bytes written; no
  // typed character reaches the output stream.
  assert.equal(written(), 'Client secret (input hidden): \n')
})

test('promptSecret applies backspace to the captured value', async () => {
  const input = new PassThrough()
  const output = new PassThrough()

  const pending = promptSecret(input, output)
  input.write(`secretX${BACKSPACE}\r`)

  assert.equal(await pending, 'secret')
})

test('promptSecret rejects on Ctrl-C', async () => {
  const input = new PassThrough()
  const output = new PassThrough()

  const pending = promptSecret(input, output)
  input.write(`part${CTRL_C}`)

  await assert.rejects(pending, (error: {code?: string}) => error.code === 'prompt-cancelled')
})

test('promptConfirm resolves true only for an affirmative answer', async () => {
  for (const answer of ['y', 'Y', 'yes', 'YES', 'Yes']) {
    const input = new PassThrough()
    const output = new PassThrough()
    const pending = promptConfirm(input, output, 'Delete? [y/N]: ')
    input.write(`${answer}\n`)
    assert.equal(await pending, true, `answer "${answer}" must confirm`)
  }
})

test('promptConfirm defaults to no on a bare Enter', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const written = collect(output)

  const pending = promptConfirm(input, output, 'Delete? [y/N]: ')
  input.write('\n')

  assert.equal(await pending, false)
  // The prompt text is the only thing written; the answer is not echoed back.
  assert.equal(written(), 'Delete? [y/N]: ')
})

test('promptConfirm treats any non-affirmative answer as no', async () => {
  for (const answer of ['n', 'no', 'nope', 'delete', 'yeah', ' ']) {
    const input = new PassThrough()
    const output = new PassThrough()
    const pending = promptConfirm(input, output, 'Delete? [y/N]: ')
    input.write(`${answer}\n`)
    assert.equal(await pending, false, `answer "${answer}" must decline`)
  }
})

test('promptConfirm accepts a CRLF line ending', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const pending = promptConfirm(input, output, 'Delete? [y/N]: ')
  input.write('y\r\n')
  assert.equal(await pending, true)
})
