import assert from 'node:assert/strict'
import {PassThrough} from 'node:stream'
import {test} from 'node:test'

import {promptSecret} from '../dist/prompt.js'

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
