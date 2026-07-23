import assert from 'node:assert/strict'
import {execFile, execFileSync} from 'node:child_process'
import {cpSync, mkdirSync, mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {promisify} from 'node:util'

import {FakeApi} from './helpers/fake-api.ts'
import {fakeKeyringEnv, packageVersion, projectRoot} from './helpers/run-cli.ts'

const execFileAsync = promisify(execFile)

function run(command: string, args: string[], cwd: string, env?: Record<string, string>): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(env ? {env} : {}),
  })
}

/**
 * Asynchronous run for commands that talk to the in-process fake API. A
 * synchronous child process would block this test's event loop, and the
 * fake API could never answer.
 */
async function runAgainstFakeApi(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<string> {
  const {stdout} = await execFileAsync(command, args, {cwd, env, encoding: 'utf8'})
  return stdout
}

/**
 * Environment for one installed-binary run: isolated per-user state, no
 * inherited INTELLIGRC_* variables, plus the file-backed fake keyring.
 * Mirrors the isolation contract of test/helpers/run-cli.ts for a binary
 * outside the repository checkout.
 */
function installedEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('INTELLIGRC_')) {
      env[key] = value
    }
  }

  env.HOME = home
  env.XDG_CONFIG_HOME = join(home, '.config')
  env.XDG_DATA_HOME = join(home, '.local', 'share')
  env.XDG_CACHE_HOME = join(home, '.cache')
  Object.assign(env, fakeKeyringEnv(join(home, 'fake-keyring.json')), extra)
  return env
}

test('a clean checkout builds, packs, installs, and serves the documented surface', {timeout: 300_000}, async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-pack-test-'))

  // Clean room: copy only the sources npm would see in a fresh checkout.
  // No dist/ is copied, so packing must build the artifact itself.
  const cleanRoom = join(workDir, 'checkout')
  for (const entry of ['package.json', 'package-lock.json', 'tsconfig.json', 'bin', 'src', 'README.md']) {
    cpSync(join(projectRoot, entry), join(cleanRoom, entry), {recursive: true})
  }

  run('npm', ['ci'], cleanRoom)
  const packOutput = run('npm', ['pack', '--pack-destination', workDir], cleanRoom)
  const tarball = join(workDir, packOutput.trim().split('\n').at(-1)!)

  // The tarball must carry the built commands, not just bin/.
  const tarballListing = run('tar', ['-tzf', tarball], workDir)
  assert.match(tarballListing, /package\/dist\/commands\/version\.js/)
  assert.match(tarballListing, /package\/dist\/commands\/commands\.js/)
  assert.match(tarballListing, /package\/README\.md/)

  // Whitelist: the package carries the manifest, the documentation, the
  // executable, and the built output — nothing else. Credentials, live
  // responses, tenant data, session data, tests, and the archived API
  // documentation can never ship because any unlisted entry fails here.
  const allowedEntry = /^package\/(package\.json|README\.md|bin\/|dist\/)/
  for (const entry of tarballListing.trim().split('\n')) {
    assert.match(entry, allowedEntry, `Unexpected file in the package: ${entry}`)
  }

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

  // Catalog discovery from the installed binary: a fresh machine with no
  // profile and no network access reads the complete offline catalog.
  const catalogHome = join(workDir, 'catalog-home')
  mkdirSync(catalogHome)
  const catalogText = run(installedBin, ['commands'], workDir, installedEnv(catalogHome))
  const catalog = JSON.parse(catalogText) as {
    catalogVersion: number
    commands: Array<{id: string; kind: string}>
  }
  assert.equal(catalog.catalogVersion, 1)
  assert.equal(catalog.commands.filter((command) => command.kind === 'api').length, 50)
  assert.ok(catalog.commands.some((command) => command.id === 'evaluation current'))

  // Representative API commands from the installed binary against the
  // fake API: one plain documented path and one path-template command.
  const api = new FakeApi()
  await api.start()
  try {
    const home = join(workDir, 'api-home')
    mkdirSync(home)
    const env = installedEnv(home, {
      INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1',
      TEST_CLIENT_SECRET: 'packed-secret-123',
    })

    api.enqueueTenants([{id: 'tenant-packed', name: 'Packed Tenant'}])
    await runAgainstFakeApi(
      installedBin,
      [
        'auth',
        'login',
        '--profile',
        'packed',
        '--client-id',
        'client-packed',
        '--client-secret-env',
        'TEST_CLIENT_SECRET',
        '--base-url',
        api.url,
      ],
      workDir,
      env,
    )

    api.enqueue({status: 200, body: {id: 7, name: 'Current evaluation'}})
    const current = await runAgainstFakeApi(
      installedBin,
      ['evaluation', 'current', '--profile', 'packed'],
      workDir,
      env,
    )
    assert.deepEqual(JSON.parse(current), {id: 7, name: 'Current evaluation'})

    api.enqueue({status: 200, body: {id: 7, name: 'Main facility'}})
    const facility = await runAgainstFakeApi(
      installedBin,
      ['facility', 'get', '7', '--profile', 'packed'],
      workDir,
      env,
    )
    assert.deepEqual(JSON.parse(facility), {id: 7, name: 'Main facility'})

    // The installed binary sent the documented paths, in order after the
    // login's tenant-discovery request.
    assert.deepEqual(
      api.requests.map((request) => request.path),
      ['/v1/Tenants', '/v1/Evaluations/Current', '/v1/Facilities/7'],
    )
  } finally {
    await api.close()
  }
})
