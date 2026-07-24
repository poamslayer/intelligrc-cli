/**
 * Process-level tests for the issue #41 control update command:
 * control update (PUT /v1/Controls/{controlId}). The command sends the
 * documented partial-update body through the guarded write runtime and prints
 * the updated record. The tests assert the recorded method, path, headers, and
 * body at the API boundary, and the process output and exit code — the same
 * external behavior the other write-command tests assert. They also prove the
 * partial-update contract: a field appears in the body only when its flag is
 * given, the integer evaluationId serializes as a JSON number, the
 * summaryStatement text passes through, and a malformed control id or a
 * non-integer evaluation-id exits 2 before any network or keyring access.
 *
 * The documented controlId path parameter is a universally unique identifier
 * (UUID), not an integer, so the command validates it as a UUID exactly like
 * the evidence and assessment-objective path parameters.
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

const CONTROL_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

const UPDATED = {
  id: CONTROL_ID,
  name: 'AC.L2-3.1.1',
  evaluationId: 42,
  summaryStatement: 'Access control is enforced through role-based policy.',
}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

test('control update sends PUT /v1/Controls/{controlId} with the full body and prints the updated record', async () => {
  api.enqueue({status: 200, body: UPDATED})

  const result = await run([
    'control', 'update', CONTROL_ID, '--profile', 'main',
    '--evaluation-id', '42',
    '--summary-statement', 'Access control is enforced through role-based policy.',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(UPDATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'PUT')
  assert.equal(request.path, `/v1/Controls/${CONTROL_ID}`)
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    evaluationId: 42,
    summaryStatement: 'Access control is enforced through role-based policy.',
  })
})

test('control update sends only the fields whose flags were supplied', async () => {
  api.enqueue({status: 200, body: UPDATED})

  await run([
    'control', 'update', CONTROL_ID, '--profile', 'main',
    '--summary-statement', 'Summary only.',
  ])

  const body = api.requests.at(-1)!.body as Record<string, unknown>
  assert.deepEqual(body, {summaryStatement: 'Summary only.'})
})

test('control update sends the evaluationId field as a JSON number in canonical form', async () => {
  api.enqueue({status: 200, body: UPDATED})

  await run([
    'control', 'update', CONTROL_ID, '--profile', 'main',
    '--evaluation-id', '007',
  ])

  const body = api.requests.at(-1)!.body as {evaluationId: number}
  assert.deepEqual(body, {evaluationId: 7})
  assert.equal(typeof body.evaluationId, 'number')
})

test('control update with no field flags sends an empty body', async () => {
  api.enqueue({status: 200, body: UPDATED})

  const result = await run(['control', 'update', CONTROL_ID, '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.rawBody, '{}')
})

test('control update with a non-integer evaluation-id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'control', 'update', CONTROL_ID, '--profile', 'main',
    '--evaluation-id', 'forty-two',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-evaluation-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('control update with a malformed control id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'control', 'update', 'not-a-uuid', '--profile', 'main',
    '--summary-statement', 'Summary only.',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-control-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a 404 on control update is passed through with exit 7 and secrets never appear in output', async () => {
  api.enqueue({status: 404, body: {title: 'Not Found', status: 404, detail: `rejected for ${TEST_SECRET}`}})

  const result = await run([
    'control', 'update', CONTROL_ID, '--profile', 'main', '--summary-statement', 'Summary only.',
  ])

  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('a 400 on control update is passed through with exit 8', async () => {
  api.enqueue({status: 400, body: {title: 'Bad Request', status: 400, detail: 'A validation error occurred.'}})

  const result = await run([
    'control', 'update', CONTROL_ID, '--profile', 'main', '--summary-statement', 'Summary only.',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'api-failure')
})

test('control update --help lists the body flags and the documented permission', async () => {
  const help = await run(['control', 'update', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /--evaluation-id/)
  assert.match(help.stdout, /--summary-statement/)
  assert.match(help.stdout, /GapAnalysis:\s+Write/)
})
