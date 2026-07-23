/**
 * Native protected-storage check. Not part of `npm test`: the automated
 * suite substitutes a file-backed fake keyring, while this script exercises
 * the real operating-system store — Windows Credential Manager, macOS
 * Keychain, or Linux Secret Service / kernel keyring — through the public
 * executable.
 *
 * Flow: set (auth login), retrieve (tenant list sends the stored secret to
 * a loopback fake API), replace (auth login --replace), delete (auth
 * remove). Direct @napi-rs/keyring reads confirm each transition against
 * the same service name the CLI uses.
 *
 * Safety: the generated secret values never reach stdout, stderr, or any
 * assertion message. The script fails when any captured CLI output or any
 * file under the isolated home directory contains a secret value.
 *
 * Usage: node test/native-store.check.ts [command [args...]]
 * The command tokens name the CLI executable under test, for example the
 * bin path of a globally installed package. Default: this checkout's
 * bin/run.js run with the current Node.js executable.
 */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'

import {Entry} from '@napi-rs/keyring'

import {FakeApi} from './helpers/fake-api.ts'
import {makeIsolatedHome, projectRoot, type CliResult} from './helpers/run-cli.ts'

const SERVICE = 'intelligrc-cli'
const SECRET_A = `native-a-${randomBytes(24).toString('hex')}`
const SECRET_B = `native-b-${randomBytes(24).toString('hex')}`
const PROFILE = `ci-native-check-${randomBytes(4).toString('hex')}`

const cliCommand =
  process.argv.length > 2 ? process.argv.slice(2) : [process.execPath, join(projectRoot, 'bin', 'run.js')]

/** Every byte the CLI wrote, scanned for secret values before exit. */
const capturedOutput: string[] = []

function sanitize(text: string): string {
  return text.replaceAll(SECRET_A, '[secret-a]').replaceAll(SECRET_B, '[secret-b]')
}

/**
 * Environment for one native CLI run. Unlike the automated suite, HOME
 * stays real: the macOS Keychain and Linux Secret Service resolve the
 * user's store through the real home and session. Only the XDG base
 * directories move, which isolates profiles.json without touching the
 * native store. Inherited INTELLIGRC_* variables are removed so each run
 * opts in explicitly.
 */
function nativeEnv(configHome: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('INTELLIGRC_')) {
      env[key] = value
    }
  }

  env.XDG_CONFIG_HOME = join(configHome, '.config')
  env.XDG_DATA_HOME = join(configHome, '.local', 'share')
  env.XDG_CACHE_HOME = join(configHome, '.cache')
  return env
}

function runCliNative(args: string[], home: string, extraEnv: Record<string, string>): Promise<CliResult> {
  const env = {...nativeEnv(home), INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1', ...extraEnv}

  // Windows command shims (.cmd/.bat) only run through cmd.exe.
  let [command, ...prefixArgs] = cliCommand
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    prefixArgs = ['/d', '/s', '/c', command, ...prefixArgs]
    command = 'cmd.exe'
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefixArgs, ...args], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      capturedOutput.push(stdout, stderr)
      resolve({stdout, stderr, code})
    })
  })
}

/** The stored native secret, or null when no entry exists. */
function readNativeSecret(): string | null {
  try {
    return new Entry(SERVICE, PROFILE).getPassword()
  } catch (error) {
    if (error instanceof Error && /no matching entry|no entry/i.test(error.message)) {
      return null
    }

    throw error
  }
}

/** Assert no file under the directory contains either secret value. */
function assertNoPlaintextSecret(directory: string): void {
  for (const entry of readdirSync(directory, {recursive: true, withFileTypes: true})) {
    if (!entry.isFile()) {
      continue
    }

    const path = join(entry.parentPath, entry.name)
    const content = readFileSync(path, 'latin1')
    assert.ok(
      !content.includes(SECRET_A) && !content.includes(SECRET_B),
      `A file under the isolated home contains a secret value in plaintext: ${path}`,
    )
  }
}

function assertExitZero(step: string, result: CliResult): void {
  assert.ok(
    result.code === 0,
    `${step} exited with code ${result.code}. stderr: ${sanitize(result.stderr)}`,
  )
}

async function login(api: FakeApi, home: string, secretVariable: string, replace: boolean): Promise<void> {
  api.enqueueTenants([{id: 'tenant-native-check', name: 'Native Check Tenant'}])
  const args = [
    'auth',
    'login',
    '--profile',
    PROFILE,
    '--client-id',
    'client-native-check',
    '--client-secret-env',
    'NATIVE_CHECK_SECRET',
    '--base-url',
    api.url,
  ]
  if (replace) {
    args.push('--replace')
  }

  const result = await runCliNative(args, home, {NATIVE_CHECK_SECRET: secretVariable})
  assertExitZero(replace ? 'auth login --replace' : 'auth login', result)
}

/** Run tenant list and return the x-client-secret header the CLI sent. */
async function retrieveSentSecret(api: FakeApi, home: string): Promise<string> {
  api.enqueueTenants([{id: 'tenant-native-check', name: 'Native Check Tenant'}])
  const before = api.requests.length
  const result = await runCliNative(['tenant', 'list', '--profile', PROFILE], home, {})
  assertExitZero('tenant list', result)
  assert.equal(api.requests.length, before + 1, 'tenant list sent no request to the fake API')
  const header = api.requests.at(-1)!.headers['x-client-secret']
  assert.ok(typeof header === 'string', 'tenant list sent no x-client-secret header')
  return header as string
}

async function main(): Promise<void> {
  const home = makeIsolatedHome()
  const api = new FakeApi()
  await api.start()

  try {
    // Set: login stores the generated secret in the native store.
    await login(api, home, SECRET_A, false)
    assert.ok(readNativeSecret() === SECRET_A, 'The native store did not return the stored secret after login.')
    assertNoPlaintextSecret(home)
    console.log('ok - set: auth login stored the secret in the native protected store')

    // Retrieve: the CLI reads the native secret and sends it as the
    // documented credential header.
    assert.ok(
      (await retrieveSentSecret(api, home)) === SECRET_A,
      'The CLI did not send the stored secret after the initial login.',
    )
    console.log('ok - retrieve: tenant list sent the stored secret from the native store')

    // Replace: a second login overwrites the stored value.
    await login(api, home, SECRET_B, true)
    assert.ok(readNativeSecret() === SECRET_B, 'The native store did not return the replacement secret.')
    assert.ok(
      (await retrieveSentSecret(api, home)) === SECRET_B,
      'The CLI did not send the replacement secret after auth login --replace.',
    )
    assertNoPlaintextSecret(home)
    console.log('ok - replace: auth login --replace stored the replacement secret')

    // Delete: removal deletes the entry from the native store.
    const removal = await runCliNative(['auth', 'remove', '--profile', PROFILE], home, {})
    assertExitZero('auth remove', removal)
    const removed = JSON.parse(removal.stdout) as {removed: string; secretExisted: boolean}
    assert.equal(removed.secretExisted, true, 'auth remove found no native secret entry to delete')
    assert.ok(readNativeSecret() === null, 'The native store still returns an entry after auth remove.')
    console.log('ok - delete: auth remove deleted the native protected store entry')

    // Unavailable store on macOS: a redirected HOME leaves the Security
    // framework without a default keychain, so login must fail with the
    // configuration exit code and write no plaintext fallback anywhere
    // under the isolated home.
    if (process.platform === 'darwin') {
      const orphanHome = makeIsolatedHome()
      api.enqueueTenants([{id: 'tenant-native-check', name: 'Native Check Tenant'}])
      const result = await runCliNative(
        [
          'auth',
          'login',
          '--profile',
          PROFILE,
          '--client-id',
          'client-native-check',
          '--client-secret-env',
          'NATIVE_CHECK_SECRET',
          '--base-url',
          api.url,
        ],
        orphanHome,
        {NATIVE_CHECK_SECRET: SECRET_A, HOME: orphanHome},
      )
      assert.ok(
        result.code === 3,
        `login without an available store exited with code ${result.code} instead of 3. ` +
          `stderr: ${sanitize(result.stderr)}`,
      )
      const failure = JSON.parse(result.stderr) as {error: {code: string}}
      assert.equal(failure.error.code, 'secret-store-failure')
      assertNoPlaintextSecret(orphanHome)
      console.log('ok - unavailable store: login exited 3 and wrote no plaintext fallback')
    }

    // No captured CLI output may contain a secret value.
    for (const text of capturedOutput) {
      assert.ok(
        !text.includes(SECRET_A) && !text.includes(SECRET_B),
        'Captured CLI output contains a generated secret value.',
      )
    }
    console.log('ok - no captured CLI output contains a generated secret value')
    console.log('native-store check passed')
  } finally {
    // Never leave a check entry behind, even after a failed assertion.
    try {
      new Entry(SERVICE, PROFILE).deleteCredential()
    } catch {
      // Already deleted, or never created.
    }

    await api.close()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(sanitize(message))
  process.exitCode = 1
})
