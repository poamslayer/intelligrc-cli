import assert from 'node:assert/strict'
import {test} from 'node:test'

import {
  createProfile,
  setupAuthContext,
  TEST_SECRET,
  writeCredentialsFile,
} from './helpers/auth-fixtures.ts'
import {startFakeApi} from './helpers/fake-api.ts'
import {runCli, type CliResult} from './helpers/run-cli.ts'

const ENVIRONMENT_SECRET = 'environment-status-secret-456'
const CREDENTIALS_FILE_SECRET = 'credentials-file-status-secret-789'

function statusIdentity(result: CliResult): Record<string, unknown> {
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  const body = JSON.parse(result.stdout) as {identity: Record<string, unknown>}
  assert.equal(body.identity.expiry, null)
  assert.equal(body.identity.permissions, null)
  return body.identity
}

test('status reports a profile identity without printing the secret', async () => {
  const ctx = setupAuthContext()
  const api = await startFakeApi()
  try {
    await createProfile(api, ctx, 'prod', {
      tenantId: 'tenant-prod',
      tenantName: 'Production Tenant',
    })

    const result = await runCli(['auth', 'status', '--profile', 'prod'], {
      home: ctx.home,
      env: ctx.env,
    })
    const identity = statusIdentity(result)

    assert.equal(identity.source, 'profile')
    assert.equal(identity.profile, 'prod')
    assert.equal(identity.credentialsFile, null)
    assert.equal(identity.secretSource, 'secrets-file')
    assert.equal(identity.secretPresent, true)
    assert.deepEqual(identity.overrides, [])
    assert.ok(!result.stdout.includes(TEST_SECRET))
  } finally {
    await api.close()
  }
})

test('status reports an environment secret override without printing it', async () => {
  const ctx = setupAuthContext()
  const api = await startFakeApi()
  try {
    await createProfile(api, ctx, 'prod')

    const result = await runCli(['auth', 'status', '--profile', 'prod'], {
      home: ctx.home,
      env: {...ctx.env, INTELLIGRC_CLIENT_SECRET: ENVIRONMENT_SECRET},
    })
    const identity = statusIdentity(result)

    assert.equal(identity.source, 'profile')
    assert.equal(identity.secretSource, 'environment')
    assert.deepEqual(identity.overrides, ['INTELLIGRC_CLIENT_SECRET'])
    assert.ok(!result.stdout.includes(TEST_SECRET))
    assert.ok(!result.stdout.includes(ENVIRONMENT_SECRET))
  } finally {
    await api.close()
  }
})

test('status reports an environment identity without printing the secret', async () => {
  const result = await runCli(['auth', 'status'], {
    env: {
      INTELLIGRC_CLIENT_ID: 'environment-client',
      INTELLIGRC_CLIENT_SECRET: ENVIRONMENT_SECRET,
      INTELLIGRC_TENANT_ID: 'environment-tenant',
    },
  })
  const identity = statusIdentity(result)

  assert.equal(identity.source, 'environment')
  assert.equal(identity.profile, null)
  assert.equal(identity.credentialsFile, null)
  assert.equal(identity.secretSource, 'environment')
  assert.equal(identity.secretPresent, true)
  assert.deepEqual(identity.overrides, [])
  assert.ok(!result.stdout.includes(ENVIRONMENT_SECRET))
})

test('status reports a credentials file identity and path without printing the secret', async () => {
  const ctx = setupAuthContext()
  const credentialsFile = writeCredentialsFile(ctx.home, {
    clientId: 'file-client',
    clientSecret: CREDENTIALS_FILE_SECRET,
    tenantId: 'file-tenant',
    tenantName: 'File Tenant',
    baseUrl: 'https://api.intelligrc.app',
  })

  const result = await runCli(['auth', 'status'], {
    home: ctx.home,
    env: {...ctx.env, INTELLIGRC_CREDENTIALS_FILE: credentialsFile},
  })
  const identity = statusIdentity(result)

  assert.equal(identity.source, 'credentials-file')
  assert.equal(identity.profile, null)
  assert.equal(identity.credentialsFile, credentialsFile)
  assert.equal(identity.secretSource, 'credentials-file')
  assert.equal(identity.secretPresent, true)
  assert.deepEqual(identity.overrides, [])
  assert.ok(!result.stdout.includes(CREDENTIALS_FILE_SECRET))
})

test('status reports a missing profile without printing a secret', async () => {
  const result = await runCli(['auth', 'status', '--profile', 'missing'])

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  assert.equal((JSON.parse(result.stderr) as {error: {code: string}}).error.code, 'profile-not-found')
  assert.ok(!result.stdout.includes(TEST_SECRET))
})

test('status reports a missing identity with exit 2 and the three ways to supply one', async () => {
  const result = await runCli(['auth', 'status'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  const error = (JSON.parse(result.stderr) as {error: {code: string; message: string}}).error
  assert.equal(error.code, 'identity-required')
  assert.match(error.message, /--profile/)
  assert.match(error.message, /INTELLIGRC_CREDENTIALS_FILE/)
  assert.match(error.message, /INTELLIGRC_TENANT_ID/)
})
