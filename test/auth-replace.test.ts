import assert from 'node:assert/strict'
import {chmodSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {type FakeApi, startFakeApi} from './helpers/fake-api.ts'
import {fakeKeyringEnv, makeIsolatedHome, runCli} from './helpers/run-cli.ts'

const FIRST_SECRET = 'first-secret-value-111'
const SECOND_SECRET = 'second-secret-value-222'

function setup() {
  const home = makeIsolatedHome()
  const keyringFile = join(home, 'fake-keyring.json')
  const env = {
    ...fakeKeyringEnv(keyringFile),
    INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1',
    FIRST_SECRET_VAR: FIRST_SECRET,
    SECOND_SECRET_VAR: SECOND_SECRET,
  }
  return {home, keyringFile, env}
}

type Context = ReturnType<typeof setup>

function login(
  api: FakeApi,
  ctx: Context,
  options: {
    secretEnv?: string
    clientId?: string
    replace?: boolean
    env?: Record<string, string>
  } = {},
): ReturnType<typeof runCli> {
  return runCli(
    [
      'auth',
      'login',
      '--profile',
      'acme',
      '--client-id',
      options.clientId ?? 'client-1',
      '--client-secret-env',
      options.secretEnv ?? 'FIRST_SECRET_VAR',
      '--base-url',
      api.url,
      ...(options.replace ? ['--replace'] : []),
    ],
    {home: ctx.home, env: options.env ?? ctx.env},
  )
}

async function createInitialProfile(api: FakeApi, ctx: Context): Promise<void> {
  api.enqueueTenants([{id: 'tenant-1', name: 'Original'}])
  const result = await login(api, ctx)
  assert.equal(result.code, 0, result.stderr)
}

function readProfile(ctx: Context): Record<string, unknown> {
  const file = JSON.parse(
    readFileSync(join(ctx.home, '.config', 'intelligrc', 'profiles.json'), 'utf8'),
  ) as {profiles: Record<string, Record<string, unknown>>}
  return file.profiles.acme
}

function storedSecrets(ctx: Context): string[] {
  return Object.values(
    JSON.parse(readFileSync(ctx.keyringFile, 'utf8')) as Record<string, string>,
  )
}

test('login without --replace leaves an existing profile unchanged', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    await createInitialProfile(api, ctx)
    const requestsAfterFirstLogin = api.requests.length

    const result = await login(api, ctx, {
      secretEnv: 'SECOND_SECRET_VAR',
      clientId: 'client-2',
    })

    assert.equal(result.code, 3)
    const error = (JSON.parse(result.stderr) as {error: {code: string}}).error
    assert.equal(error.code, 'profile-exists')

    // Rejected before any network request.
    assert.equal(api.requests.length, requestsAfterFirstLogin)
    assert.equal(readProfile(ctx).clientId, 'client-1')
    assert.deepEqual(storedSecrets(ctx), [FIRST_SECRET])
  } finally {
    await api.close()
  }
})

test('login with --replace stores the new tenant and secret', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    await createInitialProfile(api, ctx)
    api.enqueueTenants([{id: 'tenant-2', name: 'Replacement'}])

    const result = await login(api, ctx, {
      secretEnv: 'SECOND_SECRET_VAR',
      clientId: 'client-2',
      replace: true,
    })

    assert.equal(result.code, 0, result.stderr)
    const profile = readProfile(ctx)
    assert.equal(profile.clientId, 'client-2')
    assert.equal(profile.tenantId, 'tenant-2')
    assert.deepEqual(storedSecrets(ctx), [SECOND_SECRET])
  } finally {
    await api.close()
  }
})

test(
  'a failed configuration write during replacement restores the prior secret',
  {skip: process.platform === 'win32'},
  async () => {
    const ctx = setup()
    const api = await startFakeApi()
    const configDir = join(ctx.home, '.config', 'intelligrc')
    try {
      await createInitialProfile(api, ctx)
      api.enqueueTenants([{id: 'tenant-2', name: 'Replacement'}])

      // Make profiles.json unwritable so the configuration write fails
      // after the new secret is already stored.
      chmodSync(configDir, 0o500)

      const result = await login(api, ctx, {
        secretEnv: 'SECOND_SECRET_VAR',
        clientId: 'client-2',
        replace: true,
      })

      assert.notEqual(result.code, 0)
      const error = (JSON.parse(result.stderr) as {error: {code: string; message: string}})
        .error
      assert.equal(error.code, 'profiles-file-write-failed')
      assert.ok(error.message.includes('profiles.json'))

      // The prior secret is back and the prior configuration is intact.
      assert.deepEqual(storedSecrets(ctx), [FIRST_SECRET])
      chmodSync(configDir, 0o700)
      assert.equal(readProfile(ctx).clientId, 'client-1')
    } finally {
      chmodSync(configDir, 0o700)
      await api.close()
    }
  },
)

test('a failed secret write during replacement leaves the configuration untouched', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    await createInitialProfile(api, ctx)
    api.enqueueTenants([{id: 'tenant-2', name: 'Replacement'}])

    const result = await login(api, ctx, {
      secretEnv: 'SECOND_SECRET_VAR',
      clientId: 'client-2',
      replace: true,
      env: {...ctx.env, INTELLIGRC_FAKE_KEYRING_FAIL: 'set'},
    })

    assert.notEqual(result.code, 0)
    const error = (JSON.parse(result.stderr) as {error: {code: string}}).error
    assert.equal(error.code, 'secret-store-failure')

    assert.equal(readProfile(ctx).clientId, 'client-1')
    assert.deepEqual(storedSecrets(ctx), [FIRST_SECRET])
  } finally {
    await api.close()
  }
})
