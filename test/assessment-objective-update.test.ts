/**
 * Process-level tests for the issue #47 assessment-objective update command:
 * assessment-objective update (PUT /v1/AssessmentObjectives/{id}). The command
 * sends the documented partial-update body through the guarded write runtime
 * and prints the result. The tests assert the recorded method, path, headers,
 * and body at the API boundary, and the process output and exit code — the
 * same external behavior the other write-command tests assert. They also prove
 * the partial-update contract: a field appears in the body only when its flag
 * is given, integer fields serialize as JSON numbers, the single-string
 * validationMethods field passes through, and a malformed uuid or non-integer
 * flag exits 2 before any network or keyring access.
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

const OBJECTIVE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

const UPDATED = {
  id: OBJECTIVE_ID,
  name: 'AC.L2-3.1.1[a]',
  evaluationId: 42,
  statusId: 3,
  implementationDetail: 'MFA enforced for all users.',
  findingDetail: 'No gaps found.',
  recommendationDetail: 'Maintain current controls.',
  validationMethods: 'Examine, Interview',
}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

test('assessment-objective update sends PUT /v1/AssessmentObjectives/{id} with the full body and prints the updated record', async () => {
  api.enqueue({status: 200, body: UPDATED})

  const result = await run([
    'assessment-objective', 'update', OBJECTIVE_ID, '--profile', 'main',
    '--evaluation-id', '42', '--status-id', '3',
    '--implementation-detail', 'MFA enforced for all users.',
    '--finding-detail', 'No gaps found.',
    '--recommendation-detail', 'Maintain current controls.',
    '--validation-methods', 'Examine, Interview',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(UPDATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, `/v1/AssessmentObjectives/${OBJECTIVE_ID}`)
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    evaluationId: 42,
    statusId: 3,
    implementationDetail: 'MFA enforced for all users.',
    findingDetail: 'No gaps found.',
    recommendationDetail: 'Maintain current controls.',
    validationMethods: 'Examine, Interview',
  })
})

test('assessment-objective update sends only the fields whose flags were supplied', async () => {
  api.enqueue({status: 200, body: UPDATED})

  await run([
    'assessment-objective', 'update', OBJECTIVE_ID, '--profile', 'main',
    '--status-id', '5',
  ])

  const body = api.requests.at(-1)!.body as Record<string, unknown>
  assert.deepEqual(body, {statusId: 5})
})

test('assessment-objective update sends the integer fields as JSON numbers in canonical form', async () => {
  api.enqueue({status: 200, body: UPDATED})

  await run([
    'assessment-objective', 'update', OBJECTIVE_ID, '--profile', 'main',
    '--evaluation-id', '007', '--status-id', '03',
  ])

  const body = api.requests.at(-1)!.body as {evaluationId: number; statusId: number}
  assert.deepEqual(body, {evaluationId: 7, statusId: 3})
  assert.equal(typeof body.evaluationId, 'number')
  assert.equal(typeof body.statusId, 'number')
})

test('assessment-objective update with no field flags sends an empty body', async () => {
  api.enqueue({status: 200, body: UPDATED})

  const result = await run(['assessment-objective', 'update', OBJECTIVE_ID, '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.rawBody, '{}')
})

test('assessment-objective update with a non-integer evaluation-id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'assessment-objective', 'update', OBJECTIVE_ID, '--profile', 'main',
    '--evaluation-id', 'forty-two',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-evaluation-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('assessment-objective update with a non-integer status-id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'assessment-objective', 'update', OBJECTIVE_ID, '--profile', 'main',
    '--status-id', 'pass',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-status-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('assessment-objective update with a malformed objective id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'assessment-objective', 'update', 'not-a-uuid', '--profile', 'main', '--status-id', '3',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-assessment-objective-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a 404 on assessment-objective update is passed through with exit 7 and secrets never appear in output', async () => {
  api.enqueue({status: 404, body: {title: 'Not Found', status: 404, detail: `rejected for ${TEST_SECRET}`}})

  const result = await run([
    'assessment-objective', 'update', OBJECTIVE_ID, '--profile', 'main', '--status-id', '3',
  ])

  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('a 400 on assessment-objective update is passed through with exit 8', async () => {
  api.enqueue({status: 400, body: {title: 'Bad Request', status: 400, detail: 'A validation error occurred.'}})

  const result = await run([
    'assessment-objective', 'update', OBJECTIVE_ID, '--profile', 'main', '--status-id', '3',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'api-failure')
})

test('assessment-objective update --help lists the body flags and the documented permission', async () => {
  const help = await run(['assessment-objective', 'update', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /--status-id/)
  assert.match(help.stdout, /--validation-methods/)
  assert.match(help.stdout, /GapAnalysis:\s+Write/)
})
