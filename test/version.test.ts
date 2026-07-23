import assert from 'node:assert/strict'
import {test} from 'node:test'

import {packageVersion, runCli} from './helpers/run-cli.ts'

test('version prints the installed package version and nothing else', async () => {
  const result = await runCli(['version'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, `${packageVersion}\n`)
  assert.equal(result.stderr, '')
})
