import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'

import {projectRoot} from './helpers/run-cli.ts'

const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {version: string}

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})
}

test('the packed artifact installs globally and runs via pinned npx', {timeout: 120_000}, () => {
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-pack-test-'))

  // Pack the npm artifact.
  const packOutput = run('npm', ['pack', '--pack-destination', workDir], projectRoot)
  const tarball = join(workDir, packOutput.trim().split('\n').at(-1)!)

  // Global installation into an isolated prefix exposes the executable.
  const globalPrefix = join(workDir, 'global')
  run('npm', ['install', '--global', '--prefix', globalPrefix, tarball], workDir)
  const installedBin = join(globalPrefix, 'bin', 'intelligrc')
  const globalVersion = run(installedBin, ['version'], workDir)
  assert.equal(globalVersion, `${pkg.version}\n`)

  // Pinned npx-style execution runs the exact packed artifact.
  const npxCache = join(workDir, 'npx-cache')
  const npxVersion = run(
    'npm',
    ['exec', '--yes', `--cache=${npxCache}`, `--package=${tarball}`, '--', 'intelligrc', 'version'],
    workDir,
  )
  assert.equal(npxVersion, `${pkg.version}\n`)
})
