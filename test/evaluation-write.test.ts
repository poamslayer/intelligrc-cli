/**
 * Process-level tests for the issue #43 evaluation write command:
 * evaluation create (POST /v1/Evaluations). The command sends the documented
 * EvaluationCreateDTO body through the guarded write runtime and prints the
 * created record. The tests assert the recorded method, path, headers, and
 * JSON body at the API boundary, and the process output and exit code — the
 * same external behavior the other write-command tests assert.
 *
 * They also prove the input validation: the required uuid array frameworkIds
 * is built from the repeated --framework-id flag, the calendar-date flags are
 * validated and sent as the documented date-time field at midnight UTC, and a
 * missing required flag or an invalid integer, number, uuid, or date value
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

const ICL_VERSION_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const FRAMEWORK_A = '11111111-2222-3333-4444-555555555555'
const FRAMEWORK_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const CREATED = {
  id: 42,
  name: 'CMMC L2 Assessment',
  reason: 'Annual assessment',
  boundaryId: 5,
  startDate: '2026-07-24T00:00:00Z',
  endDate: '2026-12-31T00:00:00Z',
  iclVersionId: ICL_VERSION_ID,
  frameworkIds: [FRAMEWORK_A, FRAMEWORK_B],
}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

test('evaluation create sends POST /v1/Evaluations with the JSON body and prints the created record', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'CMMC L2 Assessment',
    '--reason', 'Annual assessment',
    '--boundary-id', '5',
    '--start-date', '2026-07-24',
    '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID,
    '--framework-id', FRAMEWORK_A,
    '--framework-id', FRAMEWORK_B,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(CREATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/Evaluations')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    name: 'CMMC L2 Assessment',
    reason: 'Annual assessment',
    boundaryId: 5,
    startDate: '2026-07-24T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    iclVersionId: ICL_VERSION_ID,
    frameworkIds: [FRAMEWORK_A, FRAMEWORK_B],
  })
})

test('evaluation create includes the optional fields when their flags are given', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
    '--total-budget', '50000.50',
    '--target-type', '2',
    '--previous-evaluation-id', '17',
  ])

  const body = api.requests.at(-1)!.body as Record<string, unknown>
  assert.equal(body.totalBudget, 50000.5)
  assert.equal(typeof body.totalBudget, 'number')
  assert.equal(body.targetType, 2)
  assert.equal(body.previousEvaluationId, 17)
})

test('evaluation create omits the optional fields from the body when their flags are absent', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
  ])

  const body = api.requests.at(-1)!.body as Record<string, unknown>
  assert.ok(!('totalBudget' in body))
  assert.ok(!('targetType' in body))
  assert.ok(!('previousEvaluationId' in body))
})

test('evaluation create builds the frameworkIds array in the order the flag was repeated', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID,
    '--framework-id', FRAMEWORK_B, '--framework-id', FRAMEWORK_A,
  ])

  const body = api.requests.at(-1)!.body as {frameworkIds: string[]}
  assert.deepEqual(body.frameworkIds, [FRAMEWORK_B, FRAMEWORK_A])
})

test('evaluation create sends a calendar date as the documented date-time field at midnight UTC', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-01-05', '--end-date', '2026-02-06',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
  ])

  const body = api.requests.at(-1)!.body as {startDate: string; endDate: string}
  assert.equal(body.startDate, '2026-01-05T00:00:00Z')
  assert.equal(body.endDate, '2026-02-06T00:00:00Z')
})

test('evaluation create sends the boundary identifier in canonical integer form', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '007',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
  ])

  const body = api.requests.at(-1)!.body as {boundaryId: number}
  assert.equal(body.boundaryId, 7)
  assert.equal(typeof body.boundaryId, 'number')
})

test('evaluation create without --name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('evaluation create without any --framework-id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID,
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('evaluation create with a non-integer boundary id exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', 'five',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-boundary-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('evaluation create with a malformed start date exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-13-40', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-start-date')
  assert.equal(api.requests.length, requestsBefore)
})

test('evaluation create rejects a date-time value on a date flag with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24T12:00:00Z', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-start-date')
  assert.equal(api.requests.length, requestsBefore)
})

test('evaluation create with a malformed framework uuid exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID,
    '--framework-id', FRAMEWORK_A, '--framework-id', 'not-a-uuid',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-framework-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('evaluation create with a malformed icl version uuid exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', 'not-a-uuid', '--framework-id', FRAMEWORK_A,
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-icl-version-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('evaluation create with a non-numeric total budget exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
    '--total-budget', 'lots',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-total-budget')
  assert.equal(api.requests.length, requestsBefore)
})

test('evaluation create with a non-integer target type exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
    '--target-type', 'primary',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-target-type')
  assert.equal(api.requests.length, requestsBefore)
})

test('a create API error is passed through with exit 8 and secrets never appear in output', async () => {
  api.enqueue({status: 400, body: {title: 'Bad Request', status: 400, detail: `rejected for ${TEST_SECRET}`}})

  const result = await run([
    'evaluation', 'create', '--profile', 'main',
    '--name', 'X', '--reason', 'Y', '--boundary-id', '5',
    '--start-date', '2026-07-24', '--end-date', '2026-12-31',
    '--icl-version-id', ICL_VERSION_ID, '--framework-id', FRAMEWORK_A,
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 400)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('evaluation create --help lists every flag and the documented permission', async () => {
  const help = await run(['evaluation', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  for (const flag of [
    '--name', '--reason', '--boundary-id', '--start-date', '--end-date',
    '--icl-version-id', '--framework-id', '--total-budget', '--target-type',
    '--previous-evaluation-id', '--profile',
  ]) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /Evaluations:\s+Write/)
})
