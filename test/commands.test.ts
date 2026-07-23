import assert from 'node:assert/strict'
import {test} from 'node:test'

import {runCli} from './helpers/run-cli.ts'

// Expected catalog, written out by hand from issue #2. This literal is the
// independent source of truth; it must not be derived from src/manifest.ts.
const expectedCatalog = {
  catalogVersion: 1,
  commands: [
    {
      id: 'commands',
      summary: 'Print the local command catalog.',
      kind: 'local',
      permission: null,
      args: [],
      flags: [
        {
          name: 'output',
          type: 'option',
          required: false,
          allowedValues: ['json'],
          default: 'json',
          summary: 'Output format.',
        },
      ],
    },
    {
      id: 'version',
      summary: 'Print the installed package version.',
      kind: 'local',
      permission: null,
      args: [],
      flags: [],
    },
  ],
}

test('commands --output json emits the full catalog as valid JSON', async () => {
  const result = await runCli(['commands', '--output', 'json'])

  assert.equal(result.code, 0)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), expectedCatalog)
})

test('commands defaults to JSON output when --output is omitted', async () => {
  const explicit = await runCli(['commands', '--output', 'json'])
  const defaulted = await runCli(['commands'])

  assert.equal(defaulted.code, 0)
  assert.equal(defaulted.stdout, explicit.stdout)
})

test('commands rejects an unsupported output format with exit code 2', async () => {
  const result = await runCli(['commands', '--output', 'yaml'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
})

test('commands ignores a .env file in the working directory', async () => {
  const {mkdtempSync, writeFileSync} = await import('node:fs')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')

  const poisonedCwd = mkdtempSync(join(tmpdir(), 'intelligrc-env-test-'))
  writeFileSync(
    join(poisonedCwd, '.env'),
    'INTELLIGRC_BASE_URL=http://127.0.0.1:1\nINTELLIGRC_CLIENT_ID=poisoned\n',
  )

  const clean = await runCli(['commands', '--output', 'json'])
  const poisoned = await runCli(['commands', '--output', 'json'], {cwd: poisonedCwd})

  assert.equal(poisoned.code, 0)
  assert.equal(poisoned.stdout, clean.stdout)
  assert.equal(poisoned.stderr, '')
})
