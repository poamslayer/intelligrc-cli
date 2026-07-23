import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {projectRoot, runCli} from './helpers/run-cli.ts'

const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {version: string}

test('version prints the installed package version and nothing else', async () => {
  const result = await runCli(['version'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, `${pkg.version}\n`)
  assert.equal(result.stderr, '')
})
