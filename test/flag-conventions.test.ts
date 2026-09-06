import assert from 'node:assert/strict'
import {test} from 'node:test'

import {runCli} from './helpers/run-cli.ts'

/**
 * Agent-facing flag conventions. `--json` is the spelling agents expect for
 * structured output, and `--force` is the spelling they expect for skipping a
 * confirmation. JSON is already this CLI's default format, so `--json` states
 * that default explicitly rather than changing it. `--output` stays, because
 * it is the only way to ask for `jsonl` or `table`.
 */

test('--json is accepted and selects JSON output', async () => {
  const result = await runCli(['auth', 'list', '--json'])

  assert.equal(result.code, 0)
  assert.deepEqual(JSON.parse(result.stdout), [])
})

test('--json with a conflicting --output exits 2 before the profile is read', async () => {
  const result = await runCli(['data-type', 'list', '--profile', 'nope', '--json', '--output', 'table'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')

  // profile "nope" does not exist. Reporting the flag conflict rather than
  // profile-not-found proves the check runs before any keyring access.
  const failure = JSON.parse(result.stderr).error
  assert.equal(failure.code, 'conflicting-output-flags')
})

test('--json and --output json agree, so both together are accepted', async () => {
  const result = await runCli(['data-type', 'list', '--profile', 'nope', '--json', '--output', 'json'])

  assert.equal(JSON.parse(result.stderr).error.code, 'profile-not-found')
})

test('--force skips the delete confirmation', async () => {
  const result = await runCli(['personnel', 'delete', '12', '--profile', 'nope', '--force'])

  // No terminal is attached, so without --force the delete would decline and
  // exit 2. Reaching profile resolution proves --force skipped the pause.
  assert.equal(JSON.parse(result.stderr).error.code, 'profile-not-found')
})

test('--yes, the old spelling, is no longer accepted', async () => {
  const result = await runCli(['personnel', 'delete', '12', '--profile', 'nope', '--yes'])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'unknown-flag')
})
