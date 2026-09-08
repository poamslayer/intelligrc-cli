import assert from 'node:assert/strict'
import {chmodSync, writeFileSync} from 'node:fs'
import {after, before, test} from 'node:test'

import {
  setupAuthContext,
  writeCredentialsFile,
} from './helpers/auth-fixtures.ts'
import {startFakeApi, type FakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

let api: FakeApi

before(async () => {
  api = await startFakeApi()
})

after(async () => {
  await api.close()
})

test('environment identity supplies request headers without a profile', async () => {
  const ctx = setupAuthContext()
  api.enqueue({status: 200, body: []})
  const requestsBefore = api.requests.length

  const result = await runCli(['facility', 'list'], {
    home: ctx.home,
    env: {
      ...ctx.env,
      INTELLIGRC_BASE_URL: api.url,
      INTELLIGRC_CLIENT_ID: 'environment-client',
      INTELLIGRC_CLIENT_SECRET: 'environment-secret',
      INTELLIGRC_TENANT_ID: 'environment-tenant',
    },
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.length, requestsBefore + 1)
  const request = api.requests.at(-1)!
  assert.equal(request.headers['x-client-id'], 'environment-client')
  assert.equal(request.headers['x-client-secret'], 'environment-secret')
  assert.equal(request.headers['x-tenant-id'], 'environment-tenant')
})

test('an incomplete environment identity exits 2 without a request', async () => {
  const ctx = setupAuthContext()
  const requestsBefore = api.requests.length

  const result = await runCli(['tenant', 'list'], {
    home: ctx.home,
    env: {
      ...ctx.env,
      INTELLIGRC_BASE_URL: api.url,
      INTELLIGRC_CLIENT_ID: 'environment-client',
      INTELLIGRC_CLIENT_SECRET: 'environment-secret',
    },
  })

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'identity-required')
  assert.equal(api.requests.length, requestsBefore)
})

test('no identity exits 2 without a request', async () => {
  const requestsBefore = api.requests.length
  const result = await runCli(['tenant', 'list'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'identity-required')
  assert.equal(api.requests.length, requestsBefore)
})

test('a credentials file supplies request headers without a profile', async () => {
  const ctx = setupAuthContext()
  const path = writeCredentialsFile(ctx.home, {
    clientId: 'file-client',
    clientSecret: 'file-secret',
    tenantId: 'file-tenant',
    tenantName: 'File Tenant',
    baseUrl: api.url,
  })
  api.enqueue({status: 200, body: []})
  const requestsBefore = api.requests.length

  const result = await runCli(['facility', 'list'], {
    home: ctx.home,
    env: {...ctx.env, INTELLIGRC_CREDENTIALS_FILE: path},
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.length, requestsBefore + 1)
  const request = api.requests.at(-1)!
  assert.equal(request.headers['x-client-id'], 'file-client')
  assert.equal(request.headers['x-client-secret'], 'file-secret')
  assert.equal(request.headers['x-tenant-id'], 'file-tenant')
})

test('a credentials file and profile exit 2 without a request', async () => {
  const ctx = setupAuthContext()
  const path = writeCredentialsFile(ctx.home, {
    clientId: 'file-client',
    clientSecret: 'file-secret',
    tenantId: 'file-tenant',
  })
  const requestsBefore = api.requests.length

  const result = await runCli(['tenant', 'list', '--profile', 'main'], {
    home: ctx.home,
    env: {...ctx.env, INTELLIGRC_CREDENTIALS_FILE: path},
  })

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'identity-source-conflict')
  assert.equal(api.requests.length, requestsBefore)
})

test(
  'a shared credentials file exits 3 without a request',
  {skip: process.platform === 'win32'},
  async () => {
    const ctx = setupAuthContext()
    const path = writeCredentialsFile(ctx.home, {
      clientId: 'file-client',
      clientSecret: 'file-secret',
      tenantId: 'file-tenant',
    })
    chmodSync(path, 0o644)
    const requestsBefore = api.requests.length

    const result = await runCli(['tenant', 'list'], {
      home: ctx.home,
      env: {...ctx.env, INTELLIGRC_CREDENTIALS_FILE: path},
    })

    assert.equal(result.code, 3)
    assert.equal(result.stdout, '')
    assert.equal(JSON.parse(result.stderr).error.code, 'credentials-file-permissions')
    assert.equal(api.requests.length, requestsBefore)
  },
)

test('a credentials file missing tenantId exits 3 without a request', async () => {
  const ctx = setupAuthContext()
  const path = writeCredentialsFile(ctx.home, {
    clientId: 'file-client',
    clientSecret: 'file-secret',
  })
  const requestsBefore = api.requests.length

  const result = await runCli(['tenant', 'list'], {
    home: ctx.home,
    env: {...ctx.env, INTELLIGRC_CREDENTIALS_FILE: path},
  })

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  const failure = JSON.parse(result.stderr).error
  assert.equal(failure.code, 'credentials-file-invalid')
  assert.match(failure.message, /tenantId/)
  assert.equal(api.requests.length, requestsBefore)
})

test('a credentials file that is not JSON exits 3 without a request', async () => {
  const ctx = setupAuthContext()
  const path = writeCredentialsFile(ctx.home, {})
  writeFileSync(path, 'not JSON\n', {mode: 0o600})
  const requestsBefore = api.requests.length

  const result = await runCli(['tenant', 'list'], {
    home: ctx.home,
    env: {...ctx.env, INTELLIGRC_CREDENTIALS_FILE: path},
  })

  assert.equal(result.code, 3)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'credentials-file-unreadable')
  assert.equal(api.requests.length, requestsBefore)
})

test('the tenant environment variable overrides the credentials file', async () => {
  const ctx = setupAuthContext()
  const path = writeCredentialsFile(ctx.home, {
    clientId: 'file-client',
    clientSecret: 'file-secret',
    tenantId: 'file-tenant',
    baseUrl: api.url,
  })
  api.enqueue({status: 200, body: []})
  const requestsBefore = api.requests.length

  const result = await runCli(['facility', 'list'], {
    home: ctx.home,
    env: {
      ...ctx.env,
      INTELLIGRC_CREDENTIALS_FILE: path,
      INTELLIGRC_TENANT_ID: 'environment-tenant',
    },
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.length, requestsBefore + 1)
  assert.equal(api.requests.at(-1)!.headers['x-tenant-id'], 'environment-tenant')
})
