/**
 * Process-level tests for the issue #44 boundary write command:
 * boundary create (POST /v1/Boundaries). This is the largest documented
 * request body in the write batch: sixteen scalar fields and eight array
 * fields whose item types differ (six int32 id arrays, one uuid array, and
 * one plain string array). The command sends the documented BoundaryCreateDTO
 * body through the guarded write runtime and prints the created record.
 *
 * The tests assert the recorded method, path, headers, and full JSON body at
 * the API boundary, and the process output and exit code. A comprehensive
 * request proves every field maps with its documented item type; a minimal
 * request proves the four required fields are sent and every optional field is
 * omitted when its flag is absent. A missing required flag or an invalid
 * integer or uuid in any scalar or array field exits 2 (invalid input) before
 * any network or secrets file access.
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

const FRAMEWORK_A = '11111111-2222-3333-4444-555555555555'
const FRAMEWORK_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const CREATED = {id: 9, name: 'Enclave', uniqueIdentifier: 'ENC-001'}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

/** The four required flags, reused by the tests that exercise other fields. */
const REQUIRED = [
  '--name', 'Enclave',
  '--unique-identifier', 'ENC-001',
  '--operational-status-id', '1',
  '--system-type-id', '2',
]

test('boundary create sends POST /v1/Boundaries with the complete JSON body and prints the created record', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'boundary', 'create', '--profile', 'main',
    ...REQUIRED,
    '--description', 'Primary enclave',
    '--system-environment', 'Production',
    '--network-architecture-details', 'Three tiers',
    '--operational-status-details', 'Operational',
    '--information-system-type-id', '3',
    '--information-system-type-details', 'Major application',
    '--confidentiality-id', '4',
    '--integrity-id', '5',
    '--availability-id', '6',
    '--security-category-id', '7',
    '--network-diagram-id', '8',
    '--data-flow-diagram-id', '9',
    '--device-id', '10', '--device-id', '11',
    '--location-id', '12',
    '--sensitive-information-type-id', '13',
    '--interconnection-id', '14',
    '--law-regulation-policy-id', '15',
    '--personnel-id', '16',
    '--framework-id', FRAMEWORK_A, '--framework-id', FRAMEWORK_B,
    '--cage-code', '1ABC2', '--cage-code', '3DEF4',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(CREATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/Boundaries')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    name: 'Enclave',
    uniqueIdentifier: 'ENC-001',
    operationalStatusId: 1,
    systemTypeId: 2,
    description: 'Primary enclave',
    systemEnvironment: 'Production',
    networkArchitectureDetails: 'Three tiers',
    operationalStatusDetails: 'Operational',
    informationSystemTypeId: 3,
    informationSystemTypeDetails: 'Major application',
    confidentialityId: 4,
    integrityId: 5,
    availabilityId: 6,
    securityCategoryId: 7,
    networkDiagramId: 8,
    dataFlowDiagramId: 9,
    deviceIds: [10, 11],
    locationIds: [12],
    sensitiveInformationTypeIds: [13],
    interconnectionIds: [14],
    lawRegulationPolicyIds: [15],
    personnelIds: [16],
    frameworkIds: [FRAMEWORK_A, FRAMEWORK_B],
    cageCodes: ['1ABC2', '3DEF4'],
  })
})

test('boundary create sends only the four required fields when no optional flag is given', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run(['boundary', 'create', '--profile', 'main', ...REQUIRED])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(api.requests.at(-1)!.body, {
    name: 'Enclave',
    uniqueIdentifier: 'ENC-001',
    operationalStatusId: 1,
    systemTypeId: 2,
  })
})

test('boundary create sends id fields as JSON numbers in canonical form', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'boundary', 'create', '--profile', 'main',
    '--name', 'X', '--unique-identifier', 'U',
    '--operational-status-id', '007', '--system-type-id', '02',
    '--device-id', '013',
  ])

  const body = api.requests.at(-1)!.body as {operationalStatusId: number; systemTypeId: number; deviceIds: number[]}
  assert.equal(body.operationalStatusId, 7)
  assert.equal(typeof body.operationalStatusId, 'number')
  assert.equal(body.systemTypeId, 2)
  assert.deepEqual(body.deviceIds, [13])
})

test('boundary create builds each array in the order its flag was repeated', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'boundary', 'create', '--profile', 'main', ...REQUIRED,
    '--device-id', '3', '--device-id', '1', '--device-id', '2',
    '--cage-code', 'ZZZ', '--cage-code', 'AAA',
  ])

  const body = api.requests.at(-1)!.body as {deviceIds: number[]; cageCodes: string[]}
  assert.deepEqual(body.deviceIds, [3, 1, 2])
  assert.deepEqual(body.cageCodes, ['ZZZ', 'AAA'])
})

test('boundary create without --name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'boundary', 'create', '--profile', 'main',
    '--unique-identifier', 'U', '--operational-status-id', '1', '--system-type-id', '2',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('boundary create without --unique-identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'boundary', 'create', '--profile', 'main',
    '--name', 'X', '--operational-status-id', '1', '--system-type-id', '2',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('boundary create with a non-integer required scalar exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'boundary', 'create', '--profile', 'main',
    '--name', 'X', '--unique-identifier', 'U',
    '--operational-status-id', 'live', '--system-type-id', '2',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-operational-status-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('boundary create with a non-integer optional scalar exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'boundary', 'create', '--profile', 'main', ...REQUIRED,
    '--confidentiality-id', 'high',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-confidentiality-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('boundary create with a non-integer array element exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'boundary', 'create', '--profile', 'main', ...REQUIRED,
    '--device-id', '10', '--device-id', 'ten',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-device-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('boundary create with a malformed framework uuid exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'boundary', 'create', '--profile', 'main', ...REQUIRED,
    '--framework-id', FRAMEWORK_A, '--framework-id', 'not-a-uuid',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-framework-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a create API error is passed through with exit 8 and secrets never appear in output', async () => {
  api.enqueue({status: 400, body: {title: 'Bad Request', status: 400, detail: `rejected for ${TEST_SECRET}`}})

  const result = await run(['boundary', 'create', '--profile', 'main', ...REQUIRED])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 400)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('boundary create --help lists representative flags and the documented permission', async () => {
  const help = await run(['boundary', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  for (const flag of [
    '--name', '--unique-identifier', '--operational-status-id', '--system-type-id',
    '--device-id', '--framework-id', '--cage-code', '--profile',
  ]) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /Boundaries:\s+Write/)
})
