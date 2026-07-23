import assert from 'node:assert/strict'
import {rmSync} from 'node:fs'
import {after, before, test} from 'node:test'

import {TEST_SECRET, createProfile, setupAuthContext} from './helpers/auth-fixtures.ts'
import {startFakeApi, type FakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

let api: FakeApi

before(async () => {
  api = await startFakeApi()
})

after(async () => {
  await api.close()
})

test('tenant list sends one documented request and preserves the response shape', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'main')

  const upstream = [
    {id: 'tenant-main', name: 'Tenant Main', createdDate: '2026-01-01T00:00:00Z', extra: {nested: true}},
  ]
  api.enqueue({status: 200, body: upstream})
  const requestsBefore = api.requests.length

  const result = await runCli(['tenant', 'list', '--profile', 'main'], {
    home: ctx.home,
    env: ctx.env,
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), upstream)

  assert.equal(api.requests.length, requestsBefore + 1)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, '/v1/Tenants')
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], undefined)
})

test('tenant list without --profile exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length
  const result = await runCli(['tenant', 'list'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /profile/i)
  assert.equal(api.requests.length, requestsBefore)
})

test('tenant list with an unknown profile exits 3 without a request', async () => {
  const ctx = setupAuthContext()
  const requestsBefore = api.requests.length

  const result = await runCli(['tenant', 'list', '--profile', 'ghost'], {
    home: ctx.home,
    env: {...ctx.env, INTELLIGRC_BASE_URL: api.url},
  })

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'profile-not-found')
  assert.equal(api.requests.length, requestsBefore)
})

test('tenant list with a missing protected secret exits 3 without a request', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'nosecret')
  rmSync(ctx.keyringFile)
  const requestsBefore = api.requests.length

  const result = await runCli(['tenant', 'list', '--profile', 'nosecret'], {
    home: ctx.home,
    env: ctx.env,
  })

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'client-secret-missing')
  assert.equal(api.requests.length, requestsBefore)
})

test('environment overrides win over saved profile values', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'overridden')

  const second = await startFakeApi()
  try {
    second.enqueue({status: 200, body: []})

    const result = await runCli(['tenant', 'list', '--profile', 'overridden'], {
      home: ctx.home,
      env: {
        ...ctx.env,
        INTELLIGRC_BASE_URL: second.url,
        INTELLIGRC_CLIENT_ID: 'env-client',
        INTELLIGRC_CLIENT_SECRET: 'env-secret',
      },
    })

    assert.equal(result.code, 0, result.stderr)
    assert.equal(second.requests.length, 1)
    assert.equal(second.requests[0].headers['x-client-id'], 'env-client')
    assert.equal(second.requests[0].headers['x-client-secret'], 'env-secret')
  } finally {
    await second.close()
  }
})

test('a remote plain-HTTP base URL exits 3 with no request and no bypass', async () => {
  const ctx = setupAuthContext()
  await createProfile(api, ctx, 'httpremote')
  const requestsBefore = api.requests.length

  const result = await runCli(['tenant', 'list', '--profile', 'httpremote'], {
    home: ctx.home,
    env: {...ctx.env, INTELLIGRC_BASE_URL: 'http://api.example.com'},
  })

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'profile-base-url-invalid')
  assert.equal(api.requests.length, requestsBefore)
})
