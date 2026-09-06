/**
 * Process-level tests for the issue #38 personnel write commands:
 * personnel create (POST /v1/Personnel), personnel update
 * (PUT /v1/Personnel/{id}), and personnel delete (DELETE /v1/Personnel/{id}).
 * The documented PersonnelCreateDTO and PersonnelUpdateDTO carry the identical
 * twelve scalar fields and mark `firstName` and `lastName` required, so the
 * create and update commands take the same flags and send the same body shape
 * through the guarded write runtime.
 *
 * The tests assert the recorded method, path, headers, and full JSON body at
 * the API boundary, and the process output and exit code. A comprehensive
 * request proves every field maps to its documented body field; a minimal
 * request proves only the two required fields are sent when no optional flag
 * is given. A missing required flag, a non-integer --user-type-id, or a
 * non-integer identifier argument exits 2 (invalid input) before any network
 * or keyring access.
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

const RECORD = {id: 12, firstName: 'Ada', lastName: 'Lovelace', title: 'Security Lead'}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

/** Every optional flag, paired with the body field each one supplies. */
const OPTIONAL_FLAGS = [
  '--middle-name', 'Byron',
  '--title', 'Security Lead',
  '--description', 'Owns the security program',
  '--email-address', 'ada@example.com',
  '--phone-number', '512-555-0100',
  '--office-number', '512-555-0101',
  '--network-user-name', 'alovelace',
  '--department-cd', 'SEC',
  '--ad-domain', 'example.local',
  '--user-type-id', '2',
]

const OPTIONAL_BODY = {
  middleName: 'Byron',
  title: 'Security Lead',
  description: 'Owns the security program',
  emailAddress: 'ada@example.com',
  phoneNumber: '512-555-0100',
  officeNumber: '512-555-0101',
  networkUserName: 'alovelace',
  department_CD: 'SEC',
  adDomain: 'example.local',
  userTypeId: 2,
}

const REQUIRED_BODY = {firstName: 'Ada', lastName: 'Lovelace'}

// ---------------------------------------------------------------------------
// personnel create
// ---------------------------------------------------------------------------

test('personnel create sends POST /v1/Personnel with the complete JSON body and prints the created record', async () => {
  api.enqueue({status: 201, body: RECORD})

  const result = await run([
    'personnel', 'create', '--profile', 'main',
    '--first-name', 'Ada', '--last-name', 'Lovelace',
    ...OPTIONAL_FLAGS,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(RECORD, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/Personnel')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {...REQUIRED_BODY, ...OPTIONAL_BODY})
})

test('personnel create sends only the two required fields when no optional flag is given', async () => {
  api.enqueue({status: 201, body: RECORD})

  const result = await run([
    'personnel', 'create', '--profile', 'main', '--first-name', 'Ada', '--last-name', 'Lovelace',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(api.requests.at(-1)!.body, REQUIRED_BODY)
})

test('personnel create sends the user type identifier as a JSON number in canonical form', async () => {
  api.enqueue({status: 201, body: RECORD})

  await run([
    'personnel', 'create', '--profile', 'main',
    '--first-name', 'Ada', '--last-name', 'Lovelace', '--user-type-id', '002',
  ])

  const body = api.requests.at(-1)!.body as {userTypeId: number}
  assert.equal(body.userTypeId, 2)
  assert.equal(typeof body.userTypeId, 'number')
})

test('personnel create without --first-name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['personnel', 'create', '--profile', 'main', '--last-name', 'Lovelace'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('personnel create without --last-name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['personnel', 'create', '--profile', 'main', '--first-name', 'Ada'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('personnel create with a non-integer --user-type-id exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'personnel', 'create', '--profile', 'main',
    '--first-name', 'Ada', '--last-name', 'Lovelace', '--user-type-id', 'staff',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-user-type-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('personnel create validates its input before it resolves the profile or the secret store', async () => {
  const requestsBefore = api.requests.length

  // The profile does not exist, so profile resolution — the step that reads
  // the secret store — would exit 3 (local configuration). Exit 2 with the
  // flag code proves validation ran first and no secret was read.
  const result = await run([
    'personnel', 'create', '--profile', 'absent',
    '--first-name', 'Ada', '--last-name', 'Lovelace', '--user-type-id', 'staff',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-user-type-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a personnel create 400 is passed through with its message and secrets never appear in output', async () => {
  api.enqueue({
    status: 400,
    body: {title: 'Bad Request', status: 400, detail: `rejected for ${TEST_SECRET}`},
  })

  const result = await run([
    'personnel', 'create', '--profile', 'main', '--first-name', 'Ada', '--last-name', 'Lovelace',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 400)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('personnel create --help lists every flag and the documented permission', async () => {
  const help = await run(['personnel', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  for (const flag of [
    '--first-name', '--last-name', '--middle-name', '--title', '--description',
    '--email-address', '--phone-number', '--office-number', '--network-user-name',
    '--department-cd', '--ad-domain', '--user-type-id', '--profile',
  ]) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /Personnel:\s+Write/)
})

// ---------------------------------------------------------------------------
// personnel update
// ---------------------------------------------------------------------------

test('personnel update sends PUT /v1/Personnel/{id} with the integer id in the path and prints the updated record', async () => {
  api.enqueue({status: 200, body: RECORD})

  const result = await run([
    'personnel', 'update', '12', '--profile', 'main',
    '--first-name', 'Ada', '--last-name', 'Lovelace',
    ...OPTIONAL_FLAGS,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(RECORD, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, '/v1/Personnel/12')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {...REQUIRED_BODY, ...OPTIONAL_BODY})
})

test('personnel update sends the identifier argument in canonical form', async () => {
  api.enqueue({status: 200, body: RECORD})

  const result = await run([
    'personnel', 'update', '012', '--profile', 'main', '--first-name', 'Ada', '--last-name', 'Lovelace',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, '/v1/Personnel/12')
  assert.deepEqual(api.requests.at(-1)!.body, REQUIRED_BODY)
})

test('personnel update with a non-integer identifier exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'personnel', 'update', 'ada', '--profile', 'main', '--first-name', 'Ada', '--last-name', 'Lovelace',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-personnel-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('personnel update without a required name flag exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['personnel', 'update', '12', '--profile', 'main', '--first-name', 'Ada'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('personnel update validates its input before it resolves the profile or the secret store', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'personnel', 'update', 'ada', '--profile', 'absent', '--first-name', 'Ada', '--last-name', 'Lovelace',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-personnel-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a personnel update 404 is passed through with its message and secrets never appear in output', async () => {
  api.enqueue({
    status: 404,
    body: {title: 'Object Not Found', status: 404, detail: `no person for ${TEST_SECRET}`},
  })

  const result = await run([
    'personnel', 'update', '404', '--profile', 'main', '--first-name', 'Ada', '--last-name', 'Gone',
  ])

  // A 404 maps to the not-found exit code (7), not the general API-failure code.
  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 404)
  assert.equal(error.apiError.title, 'Object Not Found')
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('personnel update --help names the id argument and the documented permission', async () => {
  const help = await run(['personnel', 'update', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /ID/)
  assert.match(help.stdout, /--first-name/)
  assert.match(help.stdout, /Personnel:\s+Write/)
})

// ---------------------------------------------------------------------------
// personnel delete
// ---------------------------------------------------------------------------

test('personnel delete --force sends DELETE /v1/Personnel/{id} with no body and prints the deletion confirmation', async () => {
  api.enqueue({status: 204})

  const result = await run(['personnel', 'delete', '12', '--profile', 'main', '--force'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), {deleted: {resource: 'person', id: 12}})

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'DELETE')
  assert.equal(request.path, '/v1/Personnel/12')
  assert.equal(request.rawBody, '')
  assert.equal(request.headers['content-type'], undefined)
  assertCredentialHeaders(request)
})

test('personnel delete --force sends the identifier in canonical integer form', async () => {
  api.enqueue({status: 204})

  await run(['personnel', 'delete', '012', '--profile', 'main', '--force'])

  assert.equal(api.requests.at(-1)!.path, '/v1/Personnel/12')
})

test('a non-interactive personnel delete without --force declines and sends no request', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['personnel', 'delete', '12', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'delete-confirmation-unavailable')
  assert.equal(api.requests.length, requestsBefore)
})

test('personnel delete with a non-integer identifier exits 2 before any prompt or network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['personnel', 'delete', 'ada', '--profile', 'main', '--force'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-personnel-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('the documented 409 conflict on delete is passed through with its message and secrets never appear in output', async () => {
  api.enqueue({
    status: 409,
    body: {
      title: 'Conflict',
      status: 409,
      detail: `The person is the authorizing official of an interconnection (${TEST_SECRET})`,
    },
  })

  const result = await run(['personnel', 'delete', '12', '--profile', 'main', '--force'])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 409)
  assert.equal(error.apiError.title, 'Conflict')
  assert.match(error.apiError.detail, /authorizing official/)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('a transient failure on a personnel delete retries and reports the attempt count', async () => {
  api.enqueue({status: 503, body: {message: 'down'}})
  api.enqueue({status: 204})
  const requestsBefore = api.requests.length

  const result = await run(['personnel', 'delete', '12', '--profile', 'main', '--force'])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {deleted: {resource: 'person', id: 12}})
  assert.equal(api.requests.length, requestsBefore + 2)
  assert.deepEqual(JSON.parse(result.stderr.trim()), {
    diagnostic: {code: 'request-retried', attempts: 2},
  })
})

test('a personnel create is not retried on a transient status, because retrying could duplicate the record', async () => {
  api.enqueue({status: 503, body: {message: 'down'}})
  const requestsBefore = api.requests.length

  const result = await run([
    'personnel', 'create', '--profile', 'main', '--first-name', 'Ada', '--last-name', 'Lovelace',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore + 1)
  assert.equal(JSON.parse(result.stderr).error.attempts, 1)
})

test('personnel delete --help shows the documented permission and describes the confirmation pause', async () => {
  const help = await run(['personnel', 'delete', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /Personnel:\s+Write/)
  assert.match(help.stdout, /--force/)
  assert.match(help.stdout, /confirm/i)
})
