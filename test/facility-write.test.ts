/**
 * Process-level tests for the issue #39 facility write commands:
 * facility create (POST /v1/Facilities) and facility update
 * (PUT /v1/Facilities/{id}). The documented FacilityCreateDTO and
 * FacilityUpdateDTO carry the identical fourteen scalar fields and mark only
 * `name` required, so both commands take the same flags and send the same
 * body shape through the guarded write runtime.
 *
 * The tests assert the recorded method, path, headers, and full JSON body at
 * the API boundary, and the process output and exit code. A comprehensive
 * request proves every field maps to its documented body field; a minimal
 * request proves only `name` is sent when no optional flag is given. A missing
 * --name, a non-integer integer flag, or a non-integer identifier argument
 * exits 2 (invalid input) before any network or keyring access.
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

const RECORD = {id: 7, name: 'Headquarters', city: 'Austin'}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

/** Every optional flag, paired with the body field each one supplies. */
const OPTIONAL_FLAGS = [
  '--description', 'Corporate office',
  '--location-type-id', '3',
  '--address', '100 Congress Ave',
  '--address-line2', 'Suite 400',
  '--city', 'Austin',
  '--state', 'TX',
  '--zip-code', '78701',
  '--country', 'United States',
  '--phone-number', '512-555-0100',
  '--website', 'https://example.com',
  '--fax-number', '512-555-0101',
  '--employee-count', '250',
  '--primary-contact-id', '12',
]

const OPTIONAL_BODY = {
  description: 'Corporate office',
  locationTypeId: 3,
  address: '100 Congress Ave',
  addressLine2: 'Suite 400',
  city: 'Austin',
  state: 'TX',
  zipCode: '78701',
  country: 'United States',
  phoneNumber: '512-555-0100',
  website: 'https://example.com',
  faxNumber: '512-555-0101',
  employeeCount: 250,
  primaryContactId: 12,
}

test('facility create sends POST /v1/Facilities with the complete JSON body and prints the created record', async () => {
  api.enqueue({status: 201, body: RECORD})

  const result = await run([
    'facility', 'create', '--profile', 'main',
    '--name', 'Headquarters',
    ...OPTIONAL_FLAGS,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(RECORD, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/Facilities')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {name: 'Headquarters', ...OPTIONAL_BODY})
})

test('facility create sends only the required name field when no optional flag is given', async () => {
  api.enqueue({status: 201, body: RECORD})

  const result = await run(['facility', 'create', '--profile', 'main', '--name', 'Headquarters'])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(api.requests.at(-1)!.body, {name: 'Headquarters'})
})

test('facility create sends integer fields as JSON numbers in canonical form', async () => {
  api.enqueue({status: 201, body: RECORD})

  await run([
    'facility', 'create', '--profile', 'main', '--name', 'Headquarters',
    '--location-type-id', '007', '--employee-count', '0250', '--primary-contact-id', '012',
  ])

  const body = api.requests.at(-1)!.body as {
    locationTypeId: number
    employeeCount: number
    primaryContactId: number
  }
  assert.equal(body.locationTypeId, 7)
  assert.equal(typeof body.locationTypeId, 'number')
  assert.equal(body.employeeCount, 250)
  assert.equal(body.primaryContactId, 12)
})

test('facility create without --name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['facility', 'create', '--profile', 'main', '--city', 'Austin'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('facility create with a non-integer integer flag exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'facility', 'create', '--profile', 'main', '--name', 'Headquarters',
    '--employee-count', 'many',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-employee-count')
  assert.equal(api.requests.length, requestsBefore)
})

test('facility update sends PUT /v1/Facilities/{id} with the integer id in the path and prints the updated record', async () => {
  api.enqueue({status: 200, body: RECORD})

  const result = await run([
    'facility', 'update', '7', '--profile', 'main',
    '--name', 'Headquarters',
    ...OPTIONAL_FLAGS,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(RECORD, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, '/v1/Facilities/7')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {name: 'Headquarters', ...OPTIONAL_BODY})
})

test('facility update sends the identifier argument in canonical form', async () => {
  api.enqueue({status: 200, body: RECORD})

  const result = await run(['facility', 'update', '007', '--profile', 'main', '--name', 'Headquarters'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, '/v1/Facilities/7')
  assert.deepEqual(api.requests.at(-1)!.body, {name: 'Headquarters'})
})

test('facility update with a non-integer identifier exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['facility', 'update', 'main-office', '--profile', 'main', '--name', 'X'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-facility-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('facility update validates its input before it resolves the profile or the secret store', async () => {
  const requestsBefore = api.requests.length

  // The profile does not exist, so profile resolution — the step that reads
  // the secret store — would exit 3 (local configuration). Exit 2 with the
  // identifier code proves validation ran first and no secret was read.
  const result = await run(['facility', 'update', 'main-office', '--profile', 'absent', '--name', 'X'])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-facility-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('facility create validates its input before it resolves the profile or the secret store', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'facility', 'create', '--profile', 'absent', '--name', 'X', '--employee-count', 'many',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-employee-count')
  assert.equal(api.requests.length, requestsBefore)
})

test('facility update without --name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['facility', 'update', '7', '--profile', 'main', '--city', 'Austin'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('a facility update 404 is passed through with its message and secrets never appear in output', async () => {
  api.enqueue({
    status: 404,
    body: {title: 'Object Not Found', status: 404, detail: `no facility for ${TEST_SECRET}`},
  })

  const result = await run(['facility', 'update', '404', '--profile', 'main', '--name', 'Gone'])

  // A 404 maps to the not-found exit code (7), not the general API-failure code.
  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 404)
  assert.equal(error.apiError.title, 'Object Not Found')
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('a facility create 400 is passed through with its message and secrets never appear in output', async () => {
  api.enqueue({
    status: 400,
    body: {title: 'Bad Request', status: 400, detail: `rejected for ${TEST_SECRET}`},
  })

  const result = await run(['facility', 'create', '--profile', 'main', '--name', 'Headquarters'])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 400)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('facility create --help lists every flag and the documented permission', async () => {
  const help = await run(['facility', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  for (const flag of [
    '--name', '--description', '--location-type-id', '--address', '--address-line2',
    '--city', '--state', '--zip-code', '--country', '--phone-number', '--website',
    '--fax-number', '--employee-count', '--primary-contact-id', '--profile',
  ]) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /Locations:\s+Write/)
})

test('facility update --help names the id argument and the documented permission', async () => {
  const help = await run(['facility', 'update', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /ID/)
  assert.match(help.stdout, /--name/)
  assert.match(help.stdout, /Locations:\s+Write/)
})
