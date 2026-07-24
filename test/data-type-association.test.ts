/**
 * Process-level tests for the issue #42 data-type association commands:
 * facility data-types set (PUT /v1/Facilities/{id}/datatypes) and
 * interconnection data-types set (PUT /v1/Interconnections/{id}/datatypes).
 * Both send the documented {dataTypeIds: int[]} body through the guarded
 * write runtime and print the result. The tests assert the recorded method,
 * path, headers, and array body at the API boundary, and the process output
 * and exit code — the same external behavior the other write-command tests
 * assert. They also prove the shared array-body machinery: a repeated flag
 * builds the array in order, an omitted flag serializes as the documented
 * empty array, and a non-integer element exits 2 before any network or
 * keyring access.
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

const FACILITY_RESULT = {
  id: 5,
  name: 'HQ',
  dataTypes: [
    {id: 1, name: 'CUI'},
    {id: 2, name: 'FCI'},
  ],
}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

// ---------------------------------------------------------------------------
// facility data-types set
// ---------------------------------------------------------------------------

test('facility data-types set sends PUT /v1/Facilities/{id}/datatypes with the dataTypeIds array and prints the result', async () => {
  api.enqueue({status: 200, body: FACILITY_RESULT})

  const result = await run([
    'facility', 'data-types', 'set', '5', '--profile', 'main',
    '--data-type-id', '1', '--data-type-id', '2',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(FACILITY_RESULT, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, '/v1/Facilities/5/datatypes')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {dataTypeIds: [1, 2]})
})

test('facility data-types set builds the array in the order the flag was repeated', async () => {
  api.enqueue({status: 200, body: FACILITY_RESULT})

  await run([
    'facility', 'data-types', 'set', '5', '--profile', 'main',
    '--data-type-id', '3', '--data-type-id', '1', '--data-type-id', '2',
  ])

  const body = api.requests.at(-1)!.body as {dataTypeIds: number[]}
  assert.deepEqual(body.dataTypeIds, [3, 1, 2])
  assert.ok(body.dataTypeIds.every((value) => typeof value === 'number'))
})

test('facility data-types set sends each identifier in canonical integer form', async () => {
  api.enqueue({status: 200, body: FACILITY_RESULT})

  await run([
    'facility', 'data-types', 'set', '5', '--profile', 'main',
    '--data-type-id', '007',
  ])

  assert.deepEqual(api.requests.at(-1)!.body, {dataTypeIds: [7]})
})

test('facility data-types set with no --data-type-id clears the association with an empty array body', async () => {
  api.enqueue({status: 200, body: {...FACILITY_RESULT, dataTypes: []}})

  const result = await run(['facility', 'data-types', 'set', '5', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  const request = api.requests.at(-1)!
  assert.equal(request.path, '/v1/Facilities/5/datatypes')
  assert.equal(request.rawBody, '{"dataTypeIds":[]}')
  assert.deepEqual(request.body, {dataTypeIds: []})
})

test('facility data-types set sends the facility identifier in canonical integer form', async () => {
  api.enqueue({status: 200, body: FACILITY_RESULT})

  await run(['facility', 'data-types', 'set', '007', '--profile', 'main', '--data-type-id', '1'])

  assert.equal(api.requests.at(-1)!.path, '/v1/Facilities/7/datatypes')
})

test('facility data-types set with a non-integer data-type id exits 2 with a stable code before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'facility', 'data-types', 'set', '5', '--profile', 'main',
    '--data-type-id', '1', '--data-type-id', 'cui',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-data-type-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('facility data-types set with a non-integer facility identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['facility', 'data-types', 'set', 'five', '--profile', 'main', '--data-type-id', '1'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-facility-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a 404 on facility data-types set is passed through with exit 7 and secrets never appear in output', async () => {
  api.enqueue({status: 404, body: {title: 'Not Found', status: 404, detail: `rejected for ${TEST_SECRET}`}})

  const result = await run(['facility', 'data-types', 'set', '5', '--profile', 'main', '--data-type-id', '1'])

  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('facility data-types set --help lists the repeatable flag and the documented permission', async () => {
  const help = await run(['facility', 'data-types', 'set', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /--data-type-id/)
  assert.match(help.stdout, /Locations:\s+Write/)
})

// ---------------------------------------------------------------------------
// interconnection data-types set
// ---------------------------------------------------------------------------

const INTERCONNECTION_RESULT = {
  id: 9,
  name: 'VPN link',
  dataTypes: [{id: 4, name: 'CUI'}],
}

test('interconnection data-types set sends PUT /v1/Interconnections/{id}/datatypes with the dataTypeIds array and prints the result', async () => {
  api.enqueue({status: 200, body: INTERCONNECTION_RESULT})

  const result = await run([
    'interconnection', 'data-types', 'set', '9', '--profile', 'main',
    '--data-type-id', '4',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(INTERCONNECTION_RESULT, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, '/v1/Interconnections/9/datatypes')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {dataTypeIds: [4]})
})

test('interconnection data-types set with no --data-type-id clears the association with an empty array body', async () => {
  api.enqueue({status: 200, body: {...INTERCONNECTION_RESULT, dataTypes: []}})

  const result = await run(['interconnection', 'data-types', 'set', '9', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.rawBody, '{"dataTypeIds":[]}')
})

test('interconnection data-types set with a non-integer identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['interconnection', 'data-types', 'set', 'nine', '--profile', 'main', '--data-type-id', '1'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-interconnection-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a transient failure on interconnection data-types set retries and reports the attempt count', async () => {
  api.enqueue({status: 503, body: {message: 'down'}})
  api.enqueue({status: 200, body: INTERCONNECTION_RESULT})
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'data-types', 'set', '9', '--profile', 'main', '--data-type-id', '4',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, `${JSON.stringify(INTERCONNECTION_RESULT, null, 2)}\n`)
  assert.equal(api.requests.length, requestsBefore + 2)
  assert.deepEqual(JSON.parse(result.stderr.trim()), {
    diagnostic: {code: 'request-retried', attempts: 2},
  })
})
