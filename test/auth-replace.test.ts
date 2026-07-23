import assert from 'node:assert/strict'
import {chmodSync, mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {test} from 'node:test'

import {
  type AuthContext,
  profilesPath,
  readKeyring,
  readProfiles,
  setupAuthContext,
} from './helpers/auth-fixtures.ts'
import {type FakeApi, startFakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

const FIRST_SECRET = 'first-secret-value-111'
const SECOND_SECRET = 'second-secret-value-222'

function setup(): AuthContext {
  return setupAuthContext({
    FIRST_SECRET_VAR: FIRST_SECRET,
    SECOND_SECRET_VAR: SECOND_SECRET,
  })
}

function login(
  api: FakeApi,
  ctx: AuthContext,
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

async function createInitialProfile(api: FakeApi, ctx: AuthContext): Promise<void> {
  api.enqueueTenants([{id: 'tenant-1', name: 'Original'}])
  const result = await login(api, ctx)
  assert.equal(result.code, 0, result.stderr)
}

function readProfile(ctx: AuthContext): Record<string, unknown> {
  return readProfiles(ctx.home).profiles.acme
}

function storedSecrets(ctx: AuthContext): string[] {
  return Object.values(readKeyring(ctx))
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
    const configDir = dirname(profilesPath(ctx.home))
    try {
      await createInitialProfile(api, ctx)
      api.enqueueTenants([{id: 'tenant-2', name: 'Replacement'}])

      // Make profiles.json unwritable so the profiles.json write fails
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

test(
  'a failed rollback names the secret store entry that requires repair',
  {skip: process.platform === 'win32'},
  async () => {
    const ctx = setup()
    const api = await startFakeApi()
    const configDir = dirname(profilesPath(ctx.home))
    try {
      // Fresh profile: the profiles.json write fails, and rollback (which
      // deletes the just-written secret) fails too.
      mkdirSync(configDir, {recursive: true})
      chmodSync(configDir, 0o500)
      api.enqueueTenants([{id: 'tenant-1', name: 'Original'}])

      const result = await login(api, ctx, {
        env: {...ctx.env, INTELLIGRC_FAKE_KEYRING_FAIL: 'delete'},
      })

      assert.equal(result.code, 3)
      const error = (JSON.parse(result.stderr) as {error: {code: string; message: string}})
        .error
      assert.equal(error.code, 'rollback-failed')
      // The exact component that requires repair is named.
      assert.ok(error.message.includes('intelligrc-cli'))
      assert.ok(error.message.includes('acme'))

      // The stranded secret is the state the message describes.
      assert.deepEqual(storedSecrets(ctx), [FIRST_SECRET])
    } finally {
      chmodSync(configDir, 0o700)
      await api.close()
    }
  },
)
