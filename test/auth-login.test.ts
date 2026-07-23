import assert from 'node:assert/strict'
import {existsSync, readFileSync} from 'node:fs'
import {test} from 'node:test'

import {
  type AuthContext,
  profilesPath,
  readKeyring,
  readProfiles,
  setupAuthContext as setup,
  TEST_SECRET as SECRET,
} from './helpers/auth-fixtures.ts'
import {type FakeApi, startFakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

type Context = AuthContext

interface LoginOptions {
  secretEnv?: string
  baseUrl?: string
  extraArgs?: string[]
  env?: Record<string, string>
}

function login(api: FakeApi, ctx: Context, options: LoginOptions = {}): ReturnType<typeof runCli> {
  return runCli(
    [
      'auth',
      'login',
      '--profile',
      'acme',
      '--client-id',
      'client-1',
      '--client-secret-env',
      options.secretEnv ?? 'TEST_CLIENT_SECRET',
      '--base-url',
      options.baseUrl ?? api.url,
      ...(options.extraArgs ?? []),
    ],
    {home: ctx.home, env: options.env ?? ctx.env},
  )
}

function stderrError(stderr: string): {code: string; message: string} {
  const parsed = JSON.parse(stderr) as {error: {code: string; message: string}}
  return parsed.error
}

test('login saves the profile and secret when discovery returns one tenant', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    api.enqueueTenants([{id: 'tenant-1', name: 'Acme', createdDate: '2026-01-01T00:00:00Z'}])

    const result = await login(api, ctx)

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stderr, '')

    const summary = JSON.parse(result.stdout)
    assert.deepEqual(summary, {
      name: 'acme',
      clientId: 'client-1',
      tenantId: 'tenant-1',
      tenantName: 'Acme',
      baseUrl: api.url,
    })

    assert.equal(api.requests.length, 1)
    assert.equal(api.requests[0].method, 'GET')
    assert.equal(api.requests[0].path, '/v1/Tenants')
    assert.equal(api.requests[0].headers['x-client-id'], 'client-1')
    assert.equal(api.requests[0].headers['x-client-secret'], SECRET)

    const keyring = readKeyring(ctx)
    const accounts = Object.keys(keyring)
    assert.equal(accounts.length, 1)
    assert.ok(accounts[0].startsWith('intelligrc-cli'))
    assert.ok(accounts[0].endsWith('acme'))
    assert.deepEqual(Object.values(keyring), [SECRET])

    const profiles = readProfiles(ctx.home)
    const saved = profiles.profiles.acme as Record<string, unknown>
    assert.equal(saved.clientId, 'client-1')
    assert.equal(saved.tenantId, 'tenant-1')
    assert.equal(saved.baseUrl, api.url)

    assert.ok(!result.stdout.includes(SECRET))
    assert.ok(!readFileSync(profilesPath(ctx.home), 'utf8').includes(SECRET))
  } finally {
    await api.close()
  }
})

test('login with zero tenants leaves no profile and no secret behind', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    api.enqueueTenants([])

    const result = await login(api, ctx)

    assert.equal(result.code, 8)
    assert.equal(result.stdout, '')
    assert.equal(stderrError(result.stderr).code, 'tenant-discovery-empty')
    assert.deepEqual(readKeyring(ctx), {})
    assert.ok(!existsSync(profilesPath(ctx.home)))
  } finally {
    await api.close()
  }
})

test('login with multiple tenants leaves no profile and no secret behind', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    api.enqueueTenants([
      {id: 'tenant-1', name: 'One'},
      {id: 'tenant-2', name: 'Two'},
    ])

    const result = await login(api, ctx)

    assert.equal(result.code, 8)
    assert.equal(result.stdout, '')
    assert.equal(stderrError(result.stderr).code, 'tenant-discovery-multiple')
    assert.deepEqual(readKeyring(ctx), {})
    assert.ok(!existsSync(profilesPath(ctx.home)))
  } finally {
    await api.close()
  }
})

test('login fails before any request when the named secret variable is unset', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    const result = await login(api, ctx, {secretEnv: 'UNSET_VARIABLE'})

    assert.equal(result.code, 3)
    assert.equal(stderrError(result.stderr).code, 'client-secret-env-missing')
    assert.equal(api.requests.length, 0)
    assert.deepEqual(readKeyring(ctx), {})
  } finally {
    await api.close()
  }
})

test('login fails before any request when the named secret variable is empty', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    const result = await login(api, ctx, {env: {...ctx.env, TEST_CLIENT_SECRET: ''}})

    assert.equal(result.code, 3)
    assert.equal(stderrError(result.stderr).code, 'client-secret-env-missing')
    assert.equal(api.requests.length, 0)
  } finally {
    await api.close()
  }
})

test('login rejects a client-secret value flag without echoing the value', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    const leaked = 'leaked-secret-argument'
    const result = await login(api, ctx, {extraArgs: [`--client-secret=${leaked}`]})

    assert.equal(result.code, 2)
    assert.ok(!result.stdout.includes(leaked))
    assert.ok(!result.stderr.includes(leaked))
    assert.equal(api.requests.length, 0)
  } finally {
    await api.close()
  }
})

test('login rejects a separated client-secret value flag without echoing the value', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    const leaked = 'leaked-secret-argument'
    const result = await login(api, ctx, {extraArgs: ['--client-secret', leaked]})

    assert.equal(result.code, 2)
    assert.ok(!result.stdout.includes(leaked))
    assert.ok(!result.stderr.includes(leaked))
    assert.equal(api.requests.length, 0)
  } finally {
    await api.close()
  }
})

test('login rejects a plain-HTTP base URL for a non-loopback host', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    const result = await login(api, ctx, {baseUrl: 'http://api.example.com'})

    assert.equal(result.code, 2)
    assert.equal(stderrError(result.stderr).code, 'base-url-requires-https')
    assert.equal(api.requests.length, 0)
  } finally {
    await api.close()
  }
})

test('login rejects a loopback HTTP base URL without the explicit switch', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    const env = {...ctx.env}
    delete env.INTELLIGRC_ALLOW_HTTP_LOCALHOST

    const result = await login(api, ctx, {env})

    assert.equal(result.code, 2)
    assert.equal(stderrError(result.stderr).code, 'base-url-requires-https')
    assert.equal(api.requests.length, 0)
  } finally {
    await api.close()
  }
})

test('login maps an authentication rejection to exit code 4', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    api.enqueue({status: 401, body: {title: 'Unauthorized'}})

    const result = await login(api, ctx)

    assert.equal(result.code, 4)
    assert.equal(stderrError(result.stderr).code, 'authentication-failed')
    assert.deepEqual(readKeyring(ctx), {})
    assert.ok(!existsSync(profilesPath(ctx.home)))
  } finally {
    await api.close()
  }
})

test('login without a terminal and without --client-secret-env fails before any request', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    // No --client-secret-env, and the spawned process has no TTY, so the
    // masked prompt is unavailable.
    const result = await runCli(
      [
        'auth',
        'login',
        '--profile',
        'acme',
        '--client-id',
        'client-1',
        '--base-url',
        api.url,
      ],
      {home: ctx.home, env: ctx.env},
    )

    assert.equal(result.code, 2)
    assert.equal(stderrError(result.stderr).code, 'client-secret-prompt-unavailable')
    assert.ok(result.stderr.includes('--client-secret-env'))
    assert.equal(api.requests.length, 0)
  } finally {
    await api.close()
  }
})

test('login redacts the client secret from an upstream error body', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    api.enqueue({
      status: 500,
      rawBody: JSON.stringify({
        detail: `server saw secret ${SECRET} for client client-1 and failed`,
      }),
    })

    const result = await login(api, ctx)

    assert.equal(result.code, 8)
    assert.ok(!result.stdout.includes(SECRET))
    assert.ok(!result.stderr.includes(SECRET))
    assert.ok(!result.stderr.includes('client-1'), 'client ID must be redacted')
    assert.notEqual(result.stderr, '')
    assert.ok(!existsSync(profilesPath(ctx.home)))
  } finally {
    await api.close()
  }
})

test('login redacts before bounding an oversized upstream error body', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    // The secret sits past the 16 KiB bound. Bounding before redaction
    // would cut the secret in half and leak its prefix.
    const boundary = 16 * 1024
    api.enqueue({
      status: 500,
      rawBody: `${'x'.repeat(boundary - 10)}${SECRET}${'y'.repeat(200)}`,
    })

    const result = await login(api, ctx)

    assert.equal(result.code, 8)
    assert.ok(!result.stderr.includes(SECRET))
    assert.ok(!result.stderr.includes(SECRET.slice(0, 10)), 'no secret prefix may leak')
    assert.ok(result.stderr.includes('[truncated]'))
  } finally {
    await api.close()
  }
})
