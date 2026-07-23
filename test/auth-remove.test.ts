import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {startFakeApi} from './helpers/fake-api.ts'
import {fakeKeyringEnv, makeIsolatedHome, runCli} from './helpers/run-cli.ts'

const SECRET = 'super-secret-value-123'

function setup() {
  const home = makeIsolatedHome()
  const keyringFile = join(home, 'fake-keyring.json')
  const env = {
    ...fakeKeyringEnv(keyringFile),
    INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1',
    TEST_CLIENT_SECRET: SECRET,
  }
  return {home, keyringFile, env}
}

async function createProfile(
  api: Awaited<ReturnType<typeof startFakeApi>>,
  ctx: ReturnType<typeof setup>,
  name: string,
): Promise<void> {
  api.enqueueTenants([{id: `tenant-${name}`, name: `Tenant ${name}`}])
  const result = await runCli(
    [
      'auth',
      'login',
      '--profile',
      name,
      '--client-id',
      `client-${name}`,
      '--client-secret-env',
      'TEST_CLIENT_SECRET',
      '--base-url',
      api.url,
    ],
    {home: ctx.home, env: ctx.env},
  )
  assert.equal(result.code, 0, result.stderr)
}

async function listNames(ctx: ReturnType<typeof setup>): Promise<string[]> {
  const result = await runCli(['auth', 'list'], {home: ctx.home, env: ctx.env})
  assert.equal(result.code, 0, result.stderr)
  return (JSON.parse(result.stdout) as Array<{name: string}>).map((row) => row.name)
}

function readKeyring(ctx: ReturnType<typeof setup>): Record<string, string> {
  return JSON.parse(readFileSync(ctx.keyringFile, 'utf8'))
}

test('remove deletes exactly the named profile and its secret together', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    await createProfile(api, ctx, 'alpha')
    await createProfile(api, ctx, 'beta')
    const requestsAfterLogins = api.requests.length

    const result = await runCli(['auth', 'remove', '--profile', 'alpha'], {
      home: ctx.home,
      env: ctx.env,
    })

    assert.equal(result.code, 0, result.stderr)
    assert.deepEqual(await listNames(ctx), ['beta'])

    const keyring = readKeyring(ctx)
    const accounts = Object.keys(keyring)
    assert.equal(accounts.length, 1)
    assert.ok(accounts[0].endsWith('beta'))

    // Removal is local: no request reached the API.
    assert.equal(api.requests.length, requestsAfterLogins)
  } finally {
    await api.close()
  }
})

test('remove fails with exit code 3 for an unknown profile', async () => {
  const ctx = setup()

  const result = await runCli(['auth', 'remove', '--profile', 'ghost'], {
    home: ctx.home,
    env: ctx.env,
  })

  assert.equal(result.code, 3)
  const error = (JSON.parse(result.stderr) as {error: {code: string}}).error
  assert.equal(error.code, 'profile-not-found')
})

test('remove reports the secret store as the failed component and keeps the profile', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    await createProfile(api, ctx, 'alpha')

    const result = await runCli(['auth', 'remove', '--profile', 'alpha'], {
      home: ctx.home,
      env: {...ctx.env, INTELLIGRC_FAKE_KEYRING_FAIL: 'delete'},
    })

    assert.notEqual(result.code, 0)
    const error = (JSON.parse(result.stderr) as {error: {code: string; message: string}})
      .error
    assert.equal(error.code, 'secret-store-failure')

    // The profile stays listed so the administrator can retry the removal.
    assert.deepEqual(await listNames(ctx), ['alpha'])
    assert.equal(Object.keys(readKeyring(ctx)).length, 1)
  } finally {
    await api.close()
  }
})
