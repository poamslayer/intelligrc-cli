/**
 * Process-level tests for the issue #33, #34, and #35 data-type write
 * commands: data-type create (POST /v1/DataTypes), data-type update
 * (PUT /v1/DataTypes/{id}), and data-type delete (DELETE /v1/DataTypes/{id}).
 * Each command sends its documented request through the guarded write
 * runtime and prints the result. The tests assert the recorded method, path,
 * headers, and request body at the API boundary, and the process output and
 * exit code — the same external behavior the read-command tests assert.
 */
import assert from 'node:assert/strict'
import {after, before, test} from 'node:test'

import {TEST_SECRET, createProfile, setupAuthContext, type AuthContext} from './helpers/auth-fixtures.ts'
import {startFakeApi, type FakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

let api: FakeApi
let ctx: AuthContext

before(async () => {
  api = await startFakeApi()
  ctx = setupAuthContext()
  await createProfile(api, ctx, 'main')
})

after(async () => {
  await api.close()
})

function run(args: string[]): ReturnType<typeof runCli> {
  return runCli(args, {home: ctx.home, env: ctx.env})
}

const CREATED = {
  id: 7,
  name: 'Controlled Unclassified Information',
  description: 'CUI',
  confidentialityId: 3,
  integrityId: 2,
  availabilityId: 1,
}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

// ---------------------------------------------------------------------------
// data-type create (#33)
// ---------------------------------------------------------------------------

test('data-type create sends POST /v1/DataTypes with the JSON body and prints the created record', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'data-type', 'create', '--profile', 'main',
    '--name', 'Controlled Unclassified Information',
    '--description', 'CUI',
    '--confidentiality-id', '3',
    '--integrity-id', '2',
    '--availability-id', '1',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(CREATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/DataTypes')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    name: 'Controlled Unclassified Information',
    description: 'CUI',
    confidentialityId: 3,
    integrityId: 2,
    availabilityId: 1,
  })
})

test('data-type create omits description from the body when the flag is absent', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'data-type', 'create', '--profile', 'main',
    '--name', 'Financial', '--confidentiality-id', '2', '--integrity-id', '2', '--availability-id', '2',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(api.requests.at(-1)!.body, {
    name: 'Financial',
    confidentialityId: 2,
    integrityId: 2,
    availabilityId: 2,
  })
})

test('data-type create sends level identifiers in canonical integer form', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'data-type', 'create', '--profile', 'main',
    '--name', 'X', '--confidentiality-id', '007', '--integrity-id', '2', '--availability-id', '3',
  ])

  const body = api.requests.at(-1)!.body as Record<string, unknown>
  assert.equal(body.confidentialityId, 7)
  assert.equal(typeof body.confidentialityId, 'number')
})

test('data-type create without a required flag exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'data-type', 'create', '--profile', 'main',
    '--confidentiality-id', '1', '--integrity-id', '1', '--availability-id', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('data-type create with a non-integer level identifier exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'data-type', 'create', '--profile', 'main',
    '--name', 'X', '--confidentiality-id', 'high', '--integrity-id', '1', '--availability-id', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-confidentiality-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a create that suffers an unconfirmable network failure is not retried and reports the check-IntelliGRC message', async () => {
  // An unreachable base URL makes the attempt a real connection failure. A
  // POST is never retried, so exactly one attempt is made.
  const unreachable = await startFakeApi()
  await unreachable.close()

  const failed = await runCli(
    [
      'data-type', 'create', '--profile', 'main',
      '--name', 'X', '--confidentiality-id', '1', '--integrity-id', '1', '--availability-id', '1',
    ],
    {home: ctx.home, env: {...ctx.env, INTELLIGRC_BASE_URL: unreachable.url}},
  )

  assert.equal(failed.code, 5)
  assert.equal(failed.stdout, '')
  const error = JSON.parse(failed.stderr.trim().split('\n').at(-1)!).error
  assert.equal(error.code, 'create-unconfirmed')
  assert.equal(error.retryable, false)
  assert.equal(error.attempts, 1)
  assert.match(error.message, /check IntelliGRC/i)
})

test('a create is not retried on a transient HTTP status, because retrying could duplicate the record', async () => {
  // A 502 or 504 can be returned after the record was already created, so a
  // POST never retries any transient status. Exactly one request is sent.
  api.enqueue({status: 503, body: {message: 'down'}})
  const requestsBefore = api.requests.length

  const result = await run([
    'data-type', 'create', '--profile', 'main',
    '--name', 'X', '--confidentiality-id', '1', '--integrity-id', '1', '--availability-id', '1',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore + 1)
  assert.equal(JSON.parse(result.stderr).error.attempts, 1)
})

test('a create API error is passed through and secrets never appear in output', async () => {
  api.enqueue({
    status: 400,
    body: {title: 'Bad Request', detail: `rejected for ${TEST_SECRET}`},
  })

  const result = await run([
    'data-type', 'create', '--profile', 'main',
    '--name', 'X', '--confidentiality-id', '1', '--integrity-id', '1', '--availability-id', '1',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 400)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('data-type create --help lists every flag and marks the required ones', async () => {
  const help = await run(['data-type', 'create', '--help'])
  assert.equal(help.code, 0, help.stderr)
  for (const flag of ['--name', '--description', '--confidentiality-id', '--integrity-id', '--availability-id', '--profile']) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /DataTypes:\s+Write/)
})

// ---------------------------------------------------------------------------
// data-type update (#34)
// ---------------------------------------------------------------------------

test('data-type update sends PUT /v1/DataTypes/{id} with the JSON body and prints the updated record', async () => {
  const updated = {...CREATED, name: 'Renamed'}
  api.enqueue({status: 200, body: updated})

  const result = await run([
    'data-type', 'update', '42', '--profile', 'main',
    '--name', 'Renamed', '--confidentiality-id', '3', '--integrity-id', '2', '--availability-id', '1',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(updated, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, '/v1/DataTypes/42')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    name: 'Renamed',
    confidentialityId: 3,
    integrityId: 2,
    availabilityId: 1,
  })
})

test('data-type update sends the identifier in canonical integer form', async () => {
  api.enqueue({status: 200, body: CREATED})

  await run([
    'data-type', 'update', '007', '--profile', 'main',
    '--name', 'X', '--confidentiality-id', '1', '--integrity-id', '1', '--availability-id', '1',
  ])

  assert.equal(api.requests.at(-1)!.path, '/v1/DataTypes/7')
})

test('data-type update with a non-integer identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'data-type', 'update', 'seven', '--profile', 'main',
    '--name', 'X', '--confidentiality-id', '1', '--integrity-id', '1', '--availability-id', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-data-type-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('data-type update missing a required flag exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'data-type', 'update', '42', '--profile', 'main',
    '--confidentiality-id', '1', '--integrity-id', '1', '--availability-id', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('a transient failure on update retries and reports the attempt count without altering the result', async () => {
  const updated = {...CREATED, name: 'Renamed'}
  api.enqueue({status: 503, body: {message: 'down'}})
  api.enqueue({status: 200, body: updated})
  const requestsBefore = api.requests.length

  const result = await run([
    'data-type', 'update', '42', '--profile', 'main',
    '--name', 'Renamed', '--confidentiality-id', '3', '--integrity-id', '2', '--availability-id', '1',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, `${JSON.stringify(updated, null, 2)}\n`)
  assert.equal(api.requests.length, requestsBefore + 2)
  assert.deepEqual(JSON.parse(result.stderr.trim()), {
    diagnostic: {code: 'request-retried', attempts: 2},
  })
})

test('a 404 on update is passed through with exit 7', async () => {
  api.enqueue({status: 404, body: {title: 'Not Found', status: 404}})

  const result = await run([
    'data-type', 'update', '42', '--profile', 'main',
    '--name', 'X', '--confidentiality-id', '1', '--integrity-id', '1', '--availability-id', '1',
  ])

  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
})

// ---------------------------------------------------------------------------
// data-type delete (#35)
// ---------------------------------------------------------------------------

test('data-type delete --force sends DELETE /v1/DataTypes/{id} with no body and prints the deletion confirmation', async () => {
  api.enqueue({status: 204})

  const result = await run(['data-type', 'delete', '42', '--profile', 'main', '--force'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), {deleted: {resource: 'data type', id: 42}})

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'DELETE')
  assert.equal(request.path, '/v1/DataTypes/42')
  assert.equal(request.rawBody, '')
  assert.equal(request.headers['content-type'], undefined)
  assertCredentialHeaders(request)
})

test('data-type delete --force sends the identifier in canonical integer form', async () => {
  api.enqueue({status: 204})

  await run(['data-type', 'delete', '007', '--profile', 'main', '--force'])

  assert.equal(api.requests.at(-1)!.path, '/v1/DataTypes/7')
})

test('a non-interactive delete without --force declines and sends no request', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['data-type', 'delete', '42', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'delete-confirmation-unavailable')
  assert.equal(api.requests.length, requestsBefore)
})

test('data-type delete with a non-integer identifier exits 2 before any prompt or network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['data-type', 'delete', 'seven', '--profile', 'main', '--force'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-data-type-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a 404 on delete is passed through with exit 7', async () => {
  api.enqueue({status: 404, body: {title: 'Not Found', status: 404}})

  const result = await run(['data-type', 'delete', '42', '--profile', 'main', '--force'])

  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
})

test('a transient failure on delete retries and reports the attempt count', async () => {
  api.enqueue({status: 503, body: {message: 'down'}})
  api.enqueue({status: 204})
  const requestsBefore = api.requests.length

  const result = await run(['data-type', 'delete', '42', '--profile', 'main', '--force'])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {deleted: {resource: 'data type', id: 42}})
  assert.equal(api.requests.length, requestsBefore + 2)
  assert.deepEqual(JSON.parse(result.stderr.trim()), {
    diagnostic: {code: 'request-retried', attempts: 2},
  })
})

test('data-type delete --help shows the documented permission and describes the confirmation pause', async () => {
  const help = await run(['data-type', 'delete', '--help'])
  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /DataTypes:\s+Write/)
  assert.match(help.stdout, /--force/)
  assert.match(help.stdout, /confirm/i)
})
