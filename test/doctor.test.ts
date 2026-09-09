import assert from 'node:assert/strict'
import {rmSync} from 'node:fs'
import {after, before, test} from 'node:test'

import {
  TEST_SECRET,
  createProfile,
  secretsPath,
  setupAuthContext,
  type AuthContext,
} from './helpers/auth-fixtures.ts'
import {startFakeApi, type FakeApi} from './helpers/fake-api.ts'
import {runCli, type CliResult} from './helpers/run-cli.ts'

let api: FakeApi

before(async () => {
  api = await startFakeApi()
})

after(async () => {
  await api.close()
})

function doctor(ctx: AuthContext, profile: string): Promise<CliResult> {
  return runCli(['doctor', '--profile', profile], {home: ctx.home, env: ctx.env})
}

/** Assert no credential or tenant value appears in either output stream. */
function assertRedacted(result: CliResult, profile: string): void {
  const combined = result.stdout + result.stderr
  assert.ok(!combined.includes(TEST_SECRET), 'client secret leaked')
  assert.ok(!combined.includes(`client-${profile}`), 'client ID leaked')
  assert.ok(!combined.includes(`tenant-${profile}`), 'tenant ID leaked')
}

test('doctor passes all five checks and stops after the tenant request', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'healthy')

  api.enqueueTenants([{id: 'tenant-healthy', name: 'Tenant healthy'}])
  const requestsBefore = api.requests.length

  const result = await doctor(ctx, 'healthy')

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore + 1)
  const tenantRequest = api.requests.at(-1)!
  assert.equal(tenantRequest.path, '/v1/Tenants')
  assert.equal(tenantRequest.headers['x-tenant-id'], undefined)

  assert.deepEqual(JSON.parse(result.stdout), {
    doctor: {
      checks: [
        {check: 'profile-complete', status: 'pass'},
        {check: 'client-secret-access', status: 'pass'},
        {check: 'base-url-https', status: 'pass'},
        {check: 'tenant-list-access', status: 'pass'},
        {check: 'tenant-agreement', status: 'pass'},
      ],
      result: 'pass',
    },
  })
  assertRedacted(result, 'healthy')
})

test('doctor without --profile exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length
  const result = await runCli(['doctor'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('doctor reports a missing profile with exit 3', async () => {
  const ctx = setupAuthContext()
  const requestsBefore = api.requests.length

  const result = await doctor(ctx, 'absent')

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'profile-not-found')
  assert.equal(api.requests.length, requestsBefore)
})

test('doctor reports a missing saved secret with exit 3 and no request', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'lostsecret')
  rmSync(secretsPath(ctx.home))
  const requestsBefore = api.requests.length

  const result = await doctor(ctx, 'lostsecret')

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'client-secret-missing')
  assert.equal(api.requests.length, requestsBefore)
  assertRedacted(result, 'lostsecret')
})

test('doctor reports a rejected credential with exit 4', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'badcred')

  api.enqueue({status: 401, body: {message: 'no client id was provided'}})

  const result = await doctor(ctx, 'badcred')

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'authentication-failed')
  assertRedacted(result, 'badcred')
})

test('doctor reports tenant disagreement with exit 3 and no values', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'drifted')

  api.enqueueTenants([{id: 'tenant-somebody-else', name: 'Other Tenant'}])

  const result = await doctor(ctx, 'drifted')

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'doctor-tenant-mismatch')
  assert.ok(!result.stderr.includes('tenant-somebody-else'), 'returned tenant ID leaked')
  assertRedacted(result, 'drifted')
})

test('doctor treats a renamed tenant as disagreement', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'renamed')

  // Same tenant ID, different display name: not exact agreement.
  api.enqueueTenants([{id: 'tenant-renamed', name: 'New Display Name'}])

  const result = await doctor(ctx, 'renamed')

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'doctor-tenant-mismatch')
  assertRedacted(result, 'renamed')
})

test('doctor treats zero and multiple returned tenants as disagreement', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'zero')
  api.enqueueTenants([])
  const zero = await doctor(ctx, 'zero')
  assert.equal(zero.code, 3)
  assert.equal(zero.stdout, '')
  assert.equal(JSON.parse(zero.stderr).error.code, 'doctor-tenant-mismatch')

  const ctxMulti = setupAuthContext()
  await createProfile(api, ctxMulti, 'multi')
  api.enqueueTenants([
    {id: 'tenant-multi', name: 'Tenant multi'},
    {id: 'tenant-extra', name: 'Tenant extra'},
  ])
  const multi = await doctor(ctxMulti, 'multi')
  assert.equal(multi.code, 3)
  assert.equal(multi.stdout, '')
  assert.equal(JSON.parse(multi.stderr).error.code, 'doctor-tenant-mismatch')
})

test('doctor diagnoses the saved profile and ignores INTELLIGRC_* overrides', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'saved')

  const other = await startFakeApi()
  try {
    api.enqueueTenants([{id: 'tenant-saved', name: 'Tenant saved'}])
    const requestsBefore = api.requests.length

    const result = await runCli(['doctor', '--profile', 'saved'], {
      home: ctx.home,
      env: {...ctx.env, INTELLIGRC_BASE_URL: other.url, INTELLIGRC_TENANT_ID: 'someone-else'},
    })

    assert.equal(result.code, 0, result.stderr)
    assert.equal(api.requests.length, requestsBefore + 1)
    assert.equal(other.requests.length, 0)
  } finally {
    await other.close()
  }
})
