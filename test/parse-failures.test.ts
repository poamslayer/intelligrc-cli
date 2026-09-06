import assert from 'node:assert/strict'
import {test} from 'node:test'

import {runCli} from './helpers/run-cli.ts'

/**
 * Parse-time failures must obey the same failure contract as every other
 * failure: one redacted JSON object on stderr, nothing on stdout, and the
 * documented exit code. These four classes are raised by oclif before a
 * command's own code runs, so they cannot reach emitFailure on their own.
 */

test('a missing required flag emits the JSON failure contract on stderr', async () => {
  const result = await runCli(['data-type', 'list'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')

  const failure = JSON.parse(result.stderr).error
  assert.equal(failure.code, 'missing-required-flag')
  assert.match(failure.message, /profile/)
})

test('an unknown flag emits the JSON failure contract on stderr', async () => {
  const result = await runCli(['data-type', 'list', '--profile', 'p', '--bogus', '1'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')

  const failure = JSON.parse(result.stderr).error
  assert.equal(failure.code, 'unknown-flag')
  assert.match(failure.message, /--bogus/)
})

test('a flag value outside the allowed set emits the JSON failure contract', async () => {
  const result = await runCli(['data-type', 'list', '--profile', 'p', '--output', 'yaml'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')

  const failure = JSON.parse(result.stderr).error
  assert.equal(failure.code, 'invalid-flag-value')
  assert.match(failure.message, /--output/)
  assert.match(failure.message, /json/)
})

test('an unknown command emits the JSON failure contract on stderr', async () => {
  const result = await runCli(['bogus', 'thing'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')

  const failure = JSON.parse(result.stderr).error
  assert.equal(failure.code, 'command-not-found')
  // The CLI separates topics with a space, so the message must not echo
  // oclif's internal colon-joined identifier back to the caller.
  assert.match(failure.message, /bogus thing/)
  assert.doesNotMatch(failure.message, /bogus:thing/)
  assert.match(failure.message, /intelligrc commands/)
})

test('a missing required argument emits the JSON failure contract on stderr', async () => {
  const result = await runCli(['facility', 'get', '--profile', 'p'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')

  const failure = JSON.parse(result.stderr).error
  assert.equal(failure.code, 'missing-required-argument')
  assert.match(failure.message, /id/)
})

test('an unexpected argument emits the JSON failure contract on stderr', async () => {
  const result = await runCli(['data-type', 'list', '--profile', 'p', 'extra'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')

  const failure = JSON.parse(result.stderr).error
  assert.equal(failure.code, 'unexpected-argument')
  assert.match(failure.message, /extra/)
})
