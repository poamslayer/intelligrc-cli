import assert from 'node:assert/strict'
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
  tenantId: string,
): Promise<void> {
  api.enqueueTenants([{id: tenantId, name: `Tenant for ${name}`}])
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

test('list prints an empty array when no profile exists', async () => {
  const ctx = setup()

  const result = await runCli(['auth', 'list'], {home: ctx.home, env: ctx.env})

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), [])
})

test('list reports non-secret settings for every profile without secrets', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    await createProfile(api, ctx, 'alpha', 'tenant-a')
    await createProfile(api, ctx, 'beta', 'tenant-b')
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

    assert.ok(!result.stdout.includes(SECRET))
    assert.equal(api.requests.length, requestsAfterLogins)
  } finally {
    await api.close()
  }
})

test('list never touches the protected secret store', async () => {
  const ctx = setup()
  const api = await startFakeApi()
  try {
    await createProfile(api, ctx, 'alpha', 'tenant-a')

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
