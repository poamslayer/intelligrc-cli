import assert from 'node:assert/strict'
import {execFile, execFileSync} from 'node:child_process'
import {cpSync, mkdirSync, mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {promisify} from 'node:util'

import {FakeApi} from './helpers/fake-api.ts'
import {fakeKeyringEnv, isolatedEnv, packageVersion, projectRoot} from './helpers/run-cli.ts'

const execFileAsync = promisify(execFile)

/**
 * Cross-platform invocation. Windows cannot spawn the npm or oclif .cmd
 * shims directly: npm resolves to the npm-cli.js that launched this test
 * run, and any other .cmd or .bat shim runs through cmd.exe.
 */
function toSpawnable(command: string, args: string[]): [string, string[]] {
  if (command === 'npm') {
    const execpath = process.env.npm_execpath
    if (execpath && execpath.endsWith('.js')) {
      return [process.execPath, [execpath, ...args]]
    }

    if (process.platform === 'win32') {
      return ['cmd.exe', ['/d', '/s', '/c', 'npm', ...args]]
    }
  }

  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return ['cmd.exe', ['/d', '/s', '/c', command, ...args]]
  }

  return [command, args]
}

function run(command: string, args: string[], cwd: string, env?: Record<string, string>): string {
  const [spawnCommand, spawnArgs] = toSpawnable(command, args)
  return execFileSync(spawnCommand, spawnArgs, {
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
  const [spawnCommand, spawnArgs] = toSpawnable(command, args)
  const {stdout} = await execFileAsync(spawnCommand, spawnArgs, {cwd, env, encoding: 'utf8'})
  return stdout
}

/**
 * Environment for one installed-binary run: the shared per-user isolation
 * plus the file-backed fake keyring, for a binary outside the repository
 * checkout.
 */
function installedEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...isolatedEnv(home),
    ...fakeKeyringEnv(join(home, 'fake-keyring.json')),
    ...extra,
  }
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
  const tarball = join(workDir, packOutput.trim().split(/\r?\n/).at(-1)!)

  // The tarball must carry the built commands, not just bin/.
  const tarballListing = run('tar', ['-tzf', tarball], workDir)
  assert.match(tarballListing, /package\/dist\/commands\/version\.js/)
  assert.match(tarballListing, /package\/dist\/commands\/commands\.js/)
  assert.match(tarballListing, /package\/README\.md/)

  // Whitelist: the package carries the manifest, the documentation, the
  // executable, and the built JavaScript — nothing else. Credentials,
  // live responses, tenant data, session data, tests, and the archived
  // OpenAPI document can never ship because any unlisted entry fails
  // here, and a non-JavaScript file under dist/ fails the same way.
  // Split on \r?\n: Windows bsdtar terminates listing lines with CRLF.
  const allowedEntry = /^package\/(package\.json|README\.md|bin\/[^/]+|dist\/.+\.js)$/
  for (const entry of tarballListing.trim().split(/\r?\n/)) {
    assert.match(entry, allowedEntry, `Unexpected file in the package: ${entry}`)
  }

  // Global installation into an isolated prefix exposes the executable.
  const globalPrefix = join(workDir, 'global')
  run('npm', ['install', '--global', '--prefix', globalPrefix, tarball], workDir)
  // npm places the executable shim at the prefix root on Windows and
  // under bin/ elsewhere.
  const installedBin =
    process.platform === 'win32'
      ? join(globalPrefix, 'intelligrc.cmd')
      : join(globalPrefix, 'bin', 'intelligrc')
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
  assert.equal(catalog.commands.length, 70)
  assert.equal(catalog.commands.filter((command) => command.kind === 'api').length, 64)
  assert.ok(catalog.commands.some((command) => command.id === 'evaluation current'))
  // The six local and profile commands ship in the installed catalog too.
  const installedIds = new Set(catalog.commands.map((command) => command.id))
  for (const id of ['auth login', 'auth list', 'auth remove', 'commands', 'doctor', 'version']) {
    assert.ok(installedIds.has(id), `Installed catalog is missing the "${id}" command`)
  }

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
