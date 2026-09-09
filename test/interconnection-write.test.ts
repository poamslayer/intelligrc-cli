/**
 * Process-level tests for the issue #48 interconnection write commands:
 * interconnection create (POST /v1/Interconnections) and interconnection
 * update (PUT /v1/Interconnections/{id}). Each command sends its documented
 * request through the guarded write runtime and prints the result. The tests
 * assert the recorded method, path, headers, and JSON body at the API
 * boundary, and the process output and exit code — the same external behavior
 * the other write-command tests assert.
 *
 * They also prove the new object-array input convention: the repeated
 * --authorization-type flag builds the documented authorizationTypes array of
 * {interconnectionAuthorizationTypeId, otherValue?} objects, one object per
 * flag occurrence, encoded as key=value pairs (id=, other=). A malformed
 * authorization-type value exits 2 (invalid input) before any network or
 * secrets file access, exactly like the scalar input validators.
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
  name: 'Vendor VPN',
  provider: 'Acme Networks',
  description: 'Site-to-site VPN to the vendor',
  authorizingOfficial: {id: 12, name: 'A. Official'},
  authorizationTypes: [
    {id: 5, description: 'ATO', otherValue: null},
    {id: 7, description: 'Other', otherValue: 'Site-to-site VPN'},
  ],
}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

// ---------------------------------------------------------------------------
// interconnection create (POST /v1/Interconnections)
// ---------------------------------------------------------------------------

test('interconnection create sends POST /v1/Interconnections with the JSON body and prints the created record', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'Vendor VPN',
    '--provider', 'Acme Networks',
    '--description', 'Site-to-site VPN to the vendor',
    '--authorizing-official-id', '12',
    '--authorization-type', 'id=5',
    '--authorization-type', 'id=7,other=Site-to-site VPN',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(CREATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/Interconnections')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    name: 'Vendor VPN',
    provider: 'Acme Networks',
    description: 'Site-to-site VPN to the vendor',
    authorizingOfficialId: 12,
    authorizationTypes: [
      {interconnectionAuthorizationTypeId: 5},
      {interconnectionAuthorizationTypeId: 7, otherValue: 'Site-to-site VPN'},
    ],
  })
})

test('interconnection create omits provider and description from the body when the flags are absent', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'Minimal',
    '--authorizing-official-id', '3',
    '--authorization-type', 'id=1',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(api.requests.at(-1)!.body, {
    name: 'Minimal',
    authorizingOfficialId: 3,
    authorizationTypes: [{interconnectionAuthorizationTypeId: 1}],
  })
})

test('interconnection create builds the authorizationTypes array in the order the flag was repeated', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'Ordered',
    '--authorizing-official-id', '3',
    '--authorization-type', 'id=9',
    '--authorization-type', 'id=2',
  ])

  const body = api.requests.at(-1)!.body as {authorizationTypes: unknown[]}
  assert.deepEqual(body.authorizationTypes, [
    {interconnectionAuthorizationTypeId: 9},
    {interconnectionAuthorizationTypeId: 2},
  ])
})

test('interconnection create sends the identifiers in canonical integer form', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', '012',
    '--authorization-type', 'id=007',
  ])

  const body = api.requests.at(-1)!.body as {authorizingOfficialId: number; authorizationTypes: Array<{interconnectionAuthorizationTypeId: number}>}
  assert.equal(body.authorizingOfficialId, 12)
  assert.equal(typeof body.authorizingOfficialId, 'number')
  assert.equal(body.authorizationTypes[0].interconnectionAuthorizationTypeId, 7)
})

test('interconnection create keeps an equals sign inside an other value', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', '3',
    '--authorization-type', 'id=4,other=a=b',
  ])

  const body = api.requests.at(-1)!.body as {authorizationTypes: Array<{otherValue?: string}>}
  assert.equal(body.authorizationTypes[0].otherValue, 'a=b')
})

test('interconnection create without --name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--authorizing-official-id', '3',
    '--authorization-type', 'id=1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection create without --authorizing-official-id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorization-type', 'id=1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection create without --authorization-type exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', '3',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection create with a non-integer authorizing-official-id exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', 'boss',
    '--authorization-type', 'id=1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-authorizing-official-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection create with an authorization-type missing its id exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', '3',
    '--authorization-type', 'other=only',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-authorization-type')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection create with a non-integer authorization-type id exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', '3',
    '--authorization-type', 'id=high',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-authorization-type')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection create with an unknown authorization-type key exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', '3',
    '--authorization-type', 'id=1,color=blue',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-authorization-type')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection create with an authorization-type segment that is not key=value exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', '3',
    '--authorization-type', '5',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-authorization-type')
  assert.equal(api.requests.length, requestsBefore)
})

test('a create API error is passed through with exit 8 and secrets never appear in output', async () => {
  api.enqueue({status: 400, body: {title: 'Bad Request', status: 400, detail: `rejected for ${TEST_SECRET}`}})

  const result = await run([
    'interconnection', 'create', '--profile', 'main',
    '--name', 'X',
    '--authorizing-official-id', '3',
    '--authorization-type', 'id=1',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 400)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('interconnection create --help lists every flag and the documented permission', async () => {
  const help = await run(['interconnection', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  for (const flag of ['--name', '--provider', '--description', '--authorizing-official-id', '--authorization-type', '--profile']) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /Interconnections:\s+Write/)
})

// ---------------------------------------------------------------------------
// interconnection update (PUT /v1/Interconnections/{id})
// ---------------------------------------------------------------------------

test('interconnection update sends PUT /v1/Interconnections/{id} with the JSON body and prints the updated record', async () => {
  const updated = {...CREATED, name: 'Renamed VPN'}
  api.enqueue({status: 200, body: updated})

  const result = await run([
    'interconnection', 'update', '42', '--profile', 'main',
    '--name', 'Renamed VPN',
    '--authorizing-official-id', '12',
    '--authorization-type', 'id=5',
    '--authorization-type', 'id=7,other=Site-to-site VPN',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(updated, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, '/v1/Interconnections/42')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    name: 'Renamed VPN',
    authorizingOfficialId: 12,
    authorizationTypes: [
      {interconnectionAuthorizationTypeId: 5},
      {interconnectionAuthorizationTypeId: 7, otherValue: 'Site-to-site VPN'},
    ],
  })
})

test('interconnection update sends only the name when the optional flags are absent', async () => {
  api.enqueue({status: 200, body: CREATED})

  await run(['interconnection', 'update', '42', '--profile', 'main', '--name', 'Renamed'])

  assert.deepEqual(api.requests.at(-1)!.body, {name: 'Renamed'})
})

test('interconnection update sends the identifier in canonical integer form', async () => {
  api.enqueue({status: 200, body: CREATED})

  await run(['interconnection', 'update', '007', '--profile', 'main', '--name', 'X'])

  assert.equal(api.requests.at(-1)!.path, '/v1/Interconnections/7')
})

test('interconnection update with a non-integer identifier exits 2 with a stable code before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['interconnection', 'update', 'seven', '--profile', 'main', '--name', 'X'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-interconnection-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection update without --name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['interconnection', 'update', '42', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('interconnection update with a malformed authorization-type exits 2 with a stable code before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'interconnection', 'update', '42', '--profile', 'main',
    '--name', 'X',
    '--authorization-type', 'id=high',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-authorization-type')
  assert.equal(api.requests.length, requestsBefore)
})

test('a 404 on interconnection update is passed through with exit 7', async () => {
  api.enqueue({status: 404, body: {title: 'Not Found', status: 404}})

  const result = await run(['interconnection', 'update', '42', '--profile', 'main', '--name', 'X'])

  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
})

test('interconnection update --help lists the flags and the documented permission', async () => {
  const help = await run(['interconnection', 'update', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /--name/)
  assert.match(help.stdout, /--authorization-type/)
  assert.match(help.stdout, /Interconnections:\s+Write/)
})
