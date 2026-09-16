import assert from 'node:assert/strict'
import {execFile, execFileSync} from 'node:child_process'
import {cpSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {promisify} from 'node:util'

import {FakeApi} from './helpers/fake-api.ts'
import {isolatedEnv, packageVersion, projectRoot} from './helpers/run-cli.ts'

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
 * Environment for one installed-binary run with per-user isolation for a
 * binary outside the repository checkout.
 */
function installedEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...isolatedEnv(home),
    ...extra,
  }
}

test('a clean checkout builds, packs, installs, and serves the documented surface', {timeout: 300_000}, async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-pack-test-'))

  // Clean room: copy only the sources npm would see in a fresh checkout.
  // No dist/ is copied, so packing must build the artifact itself.
  const cleanRoom = join(workDir, 'checkout')
  for (const entry of [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'bin',
    'src',
    'README.md',
    'LICENSE',
    // The three note files the package publishes, and the directories
    // they sit in. `files` picks exactly those three out.
    'CONTEXT.md',
    'docs',
    'official-docs',
  ]) {
    cpSync(join(projectRoot, entry), join(cleanRoom, entry), {recursive: true})
  }

  run('npm', ['ci'], cleanRoom)
  const packOutput = run('npm', ['pack', '--pack-destination', workDir], cleanRoom)
  const tarball = join(workDir, packOutput.trim().split(/\r?\n/).at(-1)!)

  // The tarball must carry the built commands, not just bin/.
  const tarballListing = run('tar', ['-tzf', tarball], workDir)
  assert.match(tarballListing, /package\/dist\/commands\/version\.js/)
  assert.match(tarballListing, /package\/dist\/core\/index\.js/)
  assert.match(tarballListing, /package\/dist\/core\/index\.d\.ts/)
  assert.match(tarballListing, /package\/dist\/commands\/commands\.js/)
  assert.match(tarballListing, /package\/README\.md/)
  assert.match(tarballListing, /package\/LICENSE/)

  // The notes the MCP server's `docs` tool serves. They ship from here so
  // there is one copy of them, kept beside the contract test that keeps
  // the errata honest.
  assert.match(tarballListing, /package\/CONTEXT\.md/)
  assert.match(tarballListing, /package\/docs\/writing-data\.md/)
  assert.match(tarballListing, /package\/official-docs\/errata\.md/)

  // Whitelist: the package carries the manifest, the documentation, the
  // executable, the built JavaScript, the declaration files the core
  // export subpath needs, and the three note files the MCP server's
  // `docs` tool serves — nothing else. Credentials, live responses,
  // tenant data, session data, tests, and the archived OpenAPI document
  // can never ship because any unlisted entry fails here. In particular
  // official-docs/ ships exactly one file, so a maintainer's local copy
  // of the vendor contract beside it cannot be published by accident.
  // Split on \r?\n: Windows bsdtar terminates listing lines with CRLF.
  const allowedEntry =
    /^package\/(package\.json|README\.md|LICENSE|CONTEXT\.md|docs\/writing-data\.md|official-docs\/errata\.md|bin\/[^/]+|dist\/.+\.(js|d\.ts))$/
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
  assert.equal(catalog.catalogVersion, 4)
  assert.equal(catalog.commands.length, 78)
  assert.equal(catalog.commands.filter((command) => command.kind === 'api').length, 71)
  assert.ok(catalog.commands.some((command) => command.id === 'evaluation current'))
  // The seven local and profile commands ship in the installed catalog too.
  const installedIds = new Set(catalog.commands.map((command) => command.id))
  for (const id of [
    'auth login',
    'auth list',
    'auth remove',
    'auth status',
    'commands',
    'doctor',
    'version',
  ]) {
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

/**
 * `official-docs/` holds the errata, which this package publishes, beside a
 * maintainer's local copy of the vendor OpenAPI document, which it must
 * never publish. The document is IntelliGRC's property.
 *
 * The `files` field picks out one file by name, so this cannot happen. That
 * is exactly the kind of claim that stops being true when someone widens a
 * glob to "official-docs/" one afternoon, so it is asserted against a
 * planted file rather than trusted.
 */
test('a vendor document sitting beside the errata never ships', {timeout: 300_000}, async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-vendor-leak-test-'))
  const cleanRoom = join(workDir, 'checkout')
  for (const entry of [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'bin',
    'src',
    'README.md',
    'LICENSE',
    'CONTEXT.md',
    'docs',
    'official-docs',
  ]) {
    cpSync(join(projectRoot, entry), join(cleanRoom, entry), {recursive: true})
  }

  // A stand-in for the vendor document, in the place a maintainer keeps it.
  const planted = join(cleanRoom, 'official-docs', 'swagger', 'v1')
  mkdirSync(planted, {recursive: true})
  writeFileSync(join(planted, 'swagger.json'), '{"openapi":"3.0.1","paths":{}}\n')
  writeFileSync(join(cleanRoom, 'official-docs', 'SHA256SUMS'), 'not a real checksum\n')

  run('npm', ['ci'], cleanRoom)
  const packOutput = run('npm', ['pack', '--pack-destination', workDir], cleanRoom)
  const tarball = join(workDir, packOutput.trim().split(/\r?\n/).at(-1)!)
  const listing = run('tar', ['-tzf', tarball], workDir)

  assert.ok(!listing.includes('swagger'), 'the packed artifact carries the vendor document')
  assert.ok(!listing.includes('SHA256SUMS'), 'the packed artifact carries the vendor checksums')
  assert.match(listing, /package\/official-docs\/errata\.md/)
})
