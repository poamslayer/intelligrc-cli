/**
 * Process-level tests for the issue #46 evidence association command:
 * evidence assessment-objectives set (PUT /v1/Evidence/{id}/AssessmentObjectives).
 * The command sends the documented {assessmentObjectiveIds: uuid[]} body through
 * the guarded write runtime and prints the result. The tests assert the recorded
 * method, path, headers, query, and array body at the API boundary, and the
 * process output and exit code — the same external behavior the other
 * write-command tests assert. They also prove the reused machinery: a repeated
 * flag builds the uuid array in order, the optional preserveExisting query
 * parameter is sent only when given, and a malformed uuid (in the path or the
 * body) exits 2 before any network or secrets file access.
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

const EVIDENCE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const OBJECTIVE_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const OBJECTIVE_B = '11111111-2222-3333-4444-555555555555'

const EVIDENCE_RESULT = {
  id: EVIDENCE_ID,
  name: 'network-diagram.pdf',
  assessmentObjectives: [
    {id: OBJECTIVE_A, name: 'AC.L2-3.1.1[a]'},
    {id: OBJECTIVE_B, name: 'AC.L2-3.1.1[b]'},
  ],
}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

test('evidence assessment-objectives set sends PUT with the id in the path and the assessmentObjectiveIds array, then prints the result', async () => {
  api.enqueue({status: 200, body: EVIDENCE_RESULT})

  const result = await run([
    'evidence', 'assessment-objectives', 'set', EVIDENCE_ID, '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_A, '--assessment-objective-id', OBJECTIVE_B,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(EVIDENCE_RESULT, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, `/v1/Evidence/${EVIDENCE_ID}/AssessmentObjectives`)
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {assessmentObjectiveIds: [OBJECTIVE_A, OBJECTIVE_B]})
})

test('evidence assessment-objectives set builds the uuid array in the order the flag was repeated', async () => {
  api.enqueue({status: 200, body: EVIDENCE_RESULT})

  await run([
    'evidence', 'assessment-objectives', 'set', EVIDENCE_ID, '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_B, '--assessment-objective-id', OBJECTIVE_A,
  ])

  const body = api.requests.at(-1)!.body as {assessmentObjectiveIds: string[]}
  assert.deepEqual(body.assessmentObjectiveIds, [OBJECTIVE_B, OBJECTIVE_A])
})

test('evidence assessment-objectives set omits the preserveExisting query parameter when the flag is not given', async () => {
  api.enqueue({status: 200, body: EVIDENCE_RESULT})

  await run([
    'evidence', 'assessment-objectives', 'set', EVIDENCE_ID, '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_A,
  ])

  assert.equal(api.requests.at(-1)!.path, `/v1/Evidence/${EVIDENCE_ID}/AssessmentObjectives`)
})

test('evidence assessment-objectives set sends preserveExisting=true when the flag is given', async () => {
  api.enqueue({status: 200, body: EVIDENCE_RESULT})

  await run([
    'evidence', 'assessment-objectives', 'set', EVIDENCE_ID, '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_A, '--preserve-existing', 'true',
  ])

  assert.equal(
    api.requests.at(-1)!.path,
    `/v1/Evidence/${EVIDENCE_ID}/AssessmentObjectives?preserveExisting=true`,
  )
})

test('evidence assessment-objectives set with a malformed objective uuid exits 2 with a stable code before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evidence', 'assessment-objectives', 'set', EVIDENCE_ID, '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_A, '--assessment-objective-id', 'not-a-uuid',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-assessment-objective-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('evidence assessment-objectives set with a malformed evidence id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evidence', 'assessment-objectives', 'set', 'not-a-uuid', '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_A,
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-evidence-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('evidence assessment-objectives set requires at least one --assessment-objective-id', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['evidence', 'assessment-objectives', 'set', EVIDENCE_ID, '--profile', 'main'])

  assert.notEqual(result.code, 0)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('a 404 on evidence assessment-objectives set is passed through with exit 7 and secrets never appear in output', async () => {
  api.enqueue({status: 404, body: {title: 'Not Found', status: 404, detail: `rejected for ${TEST_SECRET}`}})

  const result = await run([
    'evidence', 'assessment-objectives', 'set', EVIDENCE_ID, '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_A,
  ])

  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('a 400 on evidence assessment-objectives set is passed through with its message and exit 8', async () => {
  api.enqueue({status: 400, body: {title: 'Bad Request', status: 400, detail: 'A validation error occurred.'}})

  const result = await run([
    'evidence', 'assessment-objectives', 'set', EVIDENCE_ID, '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_A,
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'api-failure')
})

test('evidence assessment-objectives set --help lists the repeatable flag and the documented permission', async () => {
  const help = await run(['evidence', 'assessment-objectives', 'set', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /--assessment-objective-id/)
  assert.match(help.stdout, /--preserve-existing/)
  assert.match(help.stdout, /Evidence:\s+Write/)
})
