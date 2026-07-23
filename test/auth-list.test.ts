import assert from 'node:assert/strict'
import {test} from 'node:test'

import {
  createProfile,
  setupAuthContext,
  TEST_SECRET,
} from './helpers/auth-fixtures.ts'
import {startFakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

test('list prints an empty array when no profile exists', async () => {
  const ctx = setupAuthContext()

  const result = await runCli(['auth', 'list'], {home: ctx.home, env: ctx.env})

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), [])
})

test('list reports non-secret settings for every profile without secrets', async () => {
  const ctx = setupAuthContext()
  const api = await startFakeApi()
  try {
    await createProfile(api, ctx, 'alpha', {tenantId: 'tenant-a', tenantName: 'Tenant for alpha'})
    await createProfile(api, ctx, 'beta', {tenantId: 'tenant-b', tenantName: 'Tenant for beta'})
    const requestsAfterLogins = api.requests.length

    const result = await runCli(['auth', 'list'], {home: ctx.home, env: ctx.env})

    assert.equal(result.code, 0, result.stderr)
    const profiles = JSON.parse(result.stdout) as Array<Record<string, unknown>>
    assert.equal(profiles.length, 2)
    assert.deepEqual(
      profiles.map((profile) => profile.name),
      ['alpha', 'beta'],
    )

    const alpha = profiles[0]
    assert.equal(alpha.clientId, 'client-alpha')
    assert.equal(alpha.tenantId, 'tenant-a')
    assert.equal(alpha.tenantName, 'Tenant for alpha')
    assert.equal(alpha.baseUrl, api.url)

    assert.ok(!result.stdout.includes(TEST_SECRET))
    assert.equal(api.requests.length, requestsAfterLogins)
  } finally {
    await api.close()
  }
})

test('list never touches the protected secret store', async () => {
  const ctx = setupAuthContext()
  const api = await startFakeApi()
  try {
    await createProfile(api, ctx, 'alpha')

    // Any secret store operation would throw with this injection active,
    // so a passing list proves it performed none.
    const result = await runCli(['auth', 'list'], {
      home: ctx.home,
      env: {...ctx.env, INTELLIGRC_FAKE_KEYRING_FAIL: 'all'},
    })

    assert.equal(result.code, 0, result.stderr)
    assert.equal((JSON.parse(result.stdout) as unknown[]).length, 1)
  } finally {
    await api.close()
  }
})
