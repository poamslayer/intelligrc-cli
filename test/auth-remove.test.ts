import assert from 'node:assert/strict'
import {chmodSync, rmSync} from 'node:fs'
import {dirname} from 'node:path'
import {test} from 'node:test'

import {
  type AuthContext,
  createProfile,
  profilesPath,
  readSecrets,
  readProfiles,
  secretsPath,
  setupAuthContext,
  TEST_SECRET,
} from './helpers/auth-fixtures.ts'
import {startFakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

async function listNames(ctx: AuthContext): Promise<string[]> {
  const result = await runCli(['auth', 'list'], {home: ctx.home, env: ctx.env})
  assert.equal(result.code, 0, result.stderr)
  return (JSON.parse(result.stdout) as Array<{name: string}>).map((row) => row.name)
}

test('remove deletes exactly the named profile and its secret together', async () => {
  const ctx = setupAuthContext()
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

    assert.deepEqual(readSecrets(ctx.home), {beta: TEST_SECRET})

    // Removal is local: no request reached the API.
    assert.equal(api.requests.length, requestsAfterLogins)
  } finally {
    await api.close()
  }
})

test('remove fails with exit code 3 for an unknown profile', async () => {
  const ctx = setupAuthContext()

  const result = await runCli(['auth', 'remove', '--profile', 'ghost'], {
    home: ctx.home,
    env: ctx.env,
  })

  assert.equal(result.code, 3)
  const error = (JSON.parse(result.stderr) as {error: {code: string}}).error
  assert.equal(error.code, 'profile-not-found')
})

test(
  'remove reports the secret store as the failed component and keeps the profile',
  {skip: process.platform === 'win32'},
  async () => {
    const ctx = setupAuthContext()
    const api = await startFakeApi()
    const configDir = dirname(profilesPath(ctx.home))
    try {
      await createProfile(api, ctx, 'alpha')

      // profiles.json remains readable, but the secret deletion cannot
      // replace secrets.json in the read-only directory.
      chmodSync(configDir, 0o500)

      const result = await runCli(['auth', 'remove', '--profile', 'alpha'], {
        home: ctx.home,
        env: ctx.env,
      })

      assert.equal(result.code, 3)
      const error = (JSON.parse(result.stderr) as {error: {code: string; message: string}})
        .error
      assert.equal(error.code, 'secret-store-failure')

      // The profile stays listed so the administrator can retry the removal.
      assert.deepEqual(await listNames(ctx), ['alpha'])
      assert.equal(Object.keys(readSecrets(ctx.home)).length, 1)
    } finally {
      chmodSync(configDir, 0o700)
      await api.close()
    }
  },
)

test(
  'remove names profiles.json as the failed component when the write fails',
  {skip: process.platform === 'win32'},
  async () => {
    const ctx = setupAuthContext()
    const api = await startFakeApi()
    const configDir = dirname(profilesPath(ctx.home))
    try {
      await createProfile(api, ctx, 'alpha')

      // profiles.json stays readable inside the read-only directory, so
      // remove proceeds past the secret deletion and fails on the write.
      rmSync(secretsPath(ctx.home))
      chmodSync(configDir, 0o500)

      const result = await runCli(['auth', 'remove', '--profile', 'alpha'], {
        home: ctx.home,
        env: ctx.env,
      })

      assert.equal(result.code, 3)
      const error = (JSON.parse(result.stderr) as {error: {code: string; message: string}})
        .error
      assert.equal(error.code, 'profiles-file-write-failed')
      assert.ok(error.message.includes('profiles.json'))

      // The secret is already gone; the profile entry remains for repair.
      chmodSync(configDir, 0o700)
      assert.deepEqual(readSecrets(ctx.home), {})
      assert.ok(readProfiles(ctx.home).profiles.alpha)
    } finally {
      chmodSync(configDir, 0o700)
      await api.close()
    }
  },
)
