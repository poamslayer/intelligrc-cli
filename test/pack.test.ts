import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {cpSync, mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'

import {packageVersion, projectRoot} from './helpers/run-cli.ts'

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})
}

test('a clean checkout builds, packs, installs globally, and runs via pinned npx', {timeout: 300_000}, () => {
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-pack-test-'))

  // Clean room: copy only the sources npm would see in a fresh checkout.
  // No dist/ is copied, so packing must build the artifact itself.
  const cleanRoom = join(workDir, 'checkout')
  for (const entry of ['package.json', 'package-lock.json', 'tsconfig.json', 'bin', 'src']) {
    cpSync(join(projectRoot, entry), join(cleanRoom, entry), {recursive: true})
  }

  run('npm', ['ci'], cleanRoom)
  const packOutput = run('npm', ['pack', '--pack-destination', workDir], cleanRoom)
  const tarball = join(workDir, packOutput.trim().split('\n').at(-1)!)

  // The tarball must carry the built commands, not just bin/.
  const tarballListing = run('tar', ['-tzf', tarball], workDir)
  assert.match(tarballListing, /package\/dist\/commands\/version\.js/)
  assert.match(tarballListing, /package\/dist\/commands\/commands\.js/)

  // Global installation into an isolated prefix exposes the executable.
  const globalPrefix = join(workDir, 'global')
  run('npm', ['install', '--global', '--prefix', globalPrefix, tarball], workDir)
  const installedBin = join(globalPrefix, 'bin', 'intelligrc')
  const globalVersion = run(installedBin, ['version'], workDir)
  assert.equal(globalVersion, `${packageVersion}\n`)

  // Pinned npx-style execution runs the exact packed artifact.
  const npxCache = join(workDir, 'npx-cache')
  const npxVersion = run(
    'npm',
    ['exec', '--yes', `--cache=${npxCache}`, `--package=${tarball}`, '--', 'intelligrc', 'version'],
    workDir,
  )
  assert.equal(npxVersion, `${packageVersion}\n`)
})
