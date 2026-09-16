import assert from 'node:assert/strict'
import {execFile, execFileSync} from 'node:child_process'
import {cpSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {test} from 'node:test'
import {promisify} from 'node:util'

import {FakeApi} from './helpers/fake-api.ts'
import {projectRoot} from './helpers/run-cli.ts'

const execFileAsync = promisify(execFile)

/**
 * Cross-platform invocation. Windows cannot spawn the npm .cmd shim
 * directly: npm resolves to the npm-cli.js that launched this test run.
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

function run(command: string, args: string[], cwd: string): string {
  const [spawnCommand, spawnArgs] = toSpawnable(command, args)
  return execFileSync(spawnCommand, spawnArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/**
 * The export subpath is tested from an installed tarball rather than from
 * src/, because only the tarball proves the three things that can break
 * independently of the source: the exports map resolves, the built
 * JavaScript ships, and the declaration files ship beside it.
 */
test('the core export subpath serves the documented surface from a packed tarball', {timeout: 300_000}, async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-core-export-test-'))

  // Clean room: only the sources npm would see in a fresh checkout, so
  // packing must build the artifact itself.
  const cleanRoom = join(workDir, 'checkout')
  for (const entry of ['package.json', 'package-lock.json', 'tsconfig.json', 'bin', 'src', 'README.md', 'LICENSE']) {
    cpSync(join(projectRoot, entry), join(cleanRoom, entry), {recursive: true})
  }

  run('npm', ['ci'], cleanRoom)
  const packOutput = run('npm', ['pack', '--pack-destination', workDir], cleanRoom)
  const tarball = join(workDir, packOutput.trim().split(/\r?\n/).at(-1)!)

  // A consumer package, the shape the MCP server has.
  const consumer = join(workDir, 'consumer')
  mkdirSync(consumer)
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify({name: 'core-export-consumer', version: '1.0.0', type: 'module', private: true}, null, 2)}\n`,
  )
  run('npm', ['install', '--no-audit', '--no-fund', tarball], consumer)

  const installed = join(consumer, 'node_modules', '@poamslayer', 'intelligrc-cli')

  // 1. The subpath resolves from the install, and the catalog it serves is
  //    the same catalog the executable prints.
  const core = (await import(
    pathToFileURL(join(installed, 'dist', 'core', 'index.js')).href
  )) as typeof import('../src/core/index.ts')
  const catalog = core.buildCatalog()
  assert.equal(catalog.catalogVersion, 4)
  assert.equal(catalog.commands.length, 78)
  assert.ok(catalog.commands.some((command) => command.id === 'facility get'))

  // 2. Node resolves the subpath specifier itself, not just the file path.
  const resolved = run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "const m = await import('@poamslayer/intelligrc-cli/core'); process.stdout.write(String(m.buildCatalog().commands.length))",
    ],
    consumer,
  )
  assert.equal(resolved, '78')

  // 3. The surface is the declared one. A deep import into the package is
  //    refused, so the cost of the shared code stays visible and versioned.
  let deepImportError = ''
  try {
    run(
      process.execPath,
      ['--input-type=module', '-e', "await import('@poamslayer/intelligrc-cli/dist/manifest.js')"],
      consumer,
    )
  } catch (error) {
    deepImportError = String((error as {stderr?: string}).stderr ?? error)
  }

  assert.match(deepImportError, /ERR_PACKAGE_PATH_NOT_EXPORTED/)

  // 4. Declaration files resolve for the subpath, and every module they
  //    reference resolves too. tsc reports both as errors, so a clean run
  //    is the proof.
  writeFileSync(
    join(consumer, 'consumer.ts'),
    [
      "import {apiRequest, buildCatalog, CliFailure, resolveIdentity} from '@poamslayer/intelligrc-cli/core'",
      "import type {Catalog, CatalogCommand, Identity, HttpMethod} from '@poamslayer/intelligrc-cli/core'",
      '',
      'export const catalog: Catalog = buildCatalog()',
      'export const first: CatalogCommand = catalog.commands[0]',
      'export const method: HttpMethod = \'GET\'',
      'export const send = apiRequest',
      'export const identify = resolveIdentity',
      'export type Who = Identity',
      'export const failure = CliFailure',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          types: [],
        },
        files: ['consumer.ts'],
      },
      null,
      2,
    )}\n`,
  )

  const tsc = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')
  const {stdout: tscOutput} = await execFileAsync(
    process.execPath,
    [tsc, '--project', join(consumer, 'tsconfig.json')],
    {cwd: consumer, encoding: 'utf8'},
  )
  assert.equal(tscOutput.trim(), '')

  // 5. The transport sends a real request, with the identity the subpath
  //    resolved, against a server that records what arrived.
  const api = new FakeApi()
  await api.start()
  try {
    const credentialsFile = join(consumer, 'credentials.json')
    writeFileSync(
      credentialsFile,
      `${JSON.stringify({
        credentialsVersion: 1,
        clientId: 'client-core',
        clientSecret: 'secret-core',
        tenantId: 'tenant-core',
        baseUrl: api.url,
      })}\n`,
      {mode: 0o600},
    )

    const identity = core.resolveIdentity(
      undefined,
      join(consumer, 'config'),
      {
        INTELLIGRC_CREDENTIALS_FILE: 'credentials.json',
        INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1',
      },
      // The subpath reads no working directory, so the caller names the
      // directory a relative credentials path resolves against.
      consumer,
    )
    assert.equal(identity.source, 'credentials-file')
    assert.equal(identity.clientId, 'client-core')
    assert.equal(identity.baseUrl, api.url)

    api.enqueue({status: 200, body: {id: 7, name: 'Main facility'}})
    const response = await core.apiRequest({
      baseUrl: identity.baseUrl,
      path: '/v1/Facilities/7',
      clientId: identity.clientId,
      clientSecret: identity.clientSecret,
      tenantId: identity.tenantId,
      redactionValues: [identity.clientSecret],
      env: {},
    })

    assert.equal(response.httpStatus, 200)
    assert.deepEqual(response.body, {id: 7, name: 'Main facility'})
    assert.deepEqual(
      api.requests.map((request) => [request.method, request.path]),
      [['GET', '/v1/Facilities/7']],
    )
    assert.equal(api.requests[0].headers['x-client-id'], 'client-core')
    assert.equal(api.requests[0].headers['x-tenant-id'], 'tenant-core')
  } finally {
    await api.close()
  }
})
