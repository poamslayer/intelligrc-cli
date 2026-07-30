/**
 * Process-level tests for the issue #40 evidence write commands:
 * evidence create (POST /v1/Evidence) and evidence-folder create
 * (POST /v1/Evidence/Folders). Both documented bodies are scalar, so both
 * commands send their request through the guarded write runtime unchanged.
 *
 * The tests assert the recorded method, path, headers, and full JSON body at
 * the API boundary, and the process output and exit code. A missing required
 * flag or a --parent-id that is not a universally unique identifier (UUID)
 * exits 2 (invalid input) before any network or keyring access. The documented
 * 409 conflict on folder create is passed through with the message the API
 * returned.
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

const PARENT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const EVIDENCE = {id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', fileName: 'Policy', url: 'https://example.com/policy'}
const FOLDER = {id: 'b7f1c0d2-2c2f-4f0a-9b3e-0a1d2c3e4f50', name: 'Policies'}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

// ---------------------------------------------------------------------------
// evidence create
// ---------------------------------------------------------------------------

test('evidence create sends POST /v1/Evidence with the complete JSON body and prints the created record', async () => {
  api.enqueue({status: 201, body: EVIDENCE})

  const result = await run([
    'evidence', 'create', '--profile', 'main',
    '--file-name', 'Policy',
    '--url', 'https://example.com/policy',
    '--description', 'Access control policy',
    '--parent-id', PARENT_ID,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(EVIDENCE, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/Evidence')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    fileName: 'Policy',
    url: 'https://example.com/policy',
    description: 'Access control policy',
    parentId: PARENT_ID,
  })
})

test('evidence create sends only the two required fields when no optional flag is given', async () => {
  api.enqueue({status: 201, body: EVIDENCE})

  const result = await run([
    'evidence', 'create', '--profile', 'main',
    '--file-name', 'Policy', '--url', 'https://example.com/policy',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(api.requests.at(-1)!.body, {fileName: 'Policy', url: 'https://example.com/policy'})
})

test('evidence create without --file-name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['evidence', 'create', '--profile', 'main', '--url', 'https://example.com/policy'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('evidence create without --url exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['evidence', 'create', '--profile', 'main', '--file-name', 'Policy'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('evidence create with a --parent-id that is not a UUID exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evidence', 'create', '--profile', 'main',
    '--file-name', 'Policy', '--url', 'https://example.com/policy', '--parent-id', 'root',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-parent-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('evidence create validates its input before it resolves the profile or the secret store', async () => {
  const requestsBefore = api.requests.length

  // The profile does not exist, so profile resolution — the step that reads
  // the secret store — would exit 3 (local configuration). Exit 2 with the
  // flag code proves validation ran first and no secret was read.
  const result = await run([
    'evidence', 'create', '--profile', 'absent',
    '--file-name', 'Policy', '--url', 'https://example.com/policy', '--parent-id', 'root',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-parent-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('an evidence create 400 is passed through with its message and secrets never appear in output', async () => {
  api.enqueue({
    status: 400,
    body: {title: 'Bad Request', status: 400, detail: `rejected for ${TEST_SECRET}`},
  })

  const result = await run([
    'evidence', 'create', '--profile', 'main', '--file-name', 'Policy', '--url', 'not-a-url',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 400)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('evidence create --help lists every flag and the documented permission', async () => {
  const help = await run(['evidence', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  for (const flag of ['--file-name', '--url', '--description', '--parent-id', '--profile']) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /Evidence:\s+Write/)
})

// ---------------------------------------------------------------------------
// evidence-folder create
// ---------------------------------------------------------------------------

test('evidence-folder create sends POST /v1/Evidence/Folders with the JSON body and prints the created folder', async () => {
  api.enqueue({status: 201, body: FOLDER})

  const result = await run([
    'evidence-folder', 'create', '--profile', 'main', '--name', 'Policies', '--parent-id', PARENT_ID,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(FOLDER, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/Evidence/Folders')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {name: 'Policies', parentId: PARENT_ID})
})

test('evidence-folder create omits parentId from the body when the flag is absent, creating a root folder', async () => {
  api.enqueue({status: 201, body: FOLDER})

  const result = await run(['evidence-folder', 'create', '--profile', 'main', '--name', 'Policies'])

  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(api.requests.at(-1)!.body, {name: 'Policies'})
})

test('evidence-folder create without --name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['evidence-folder', 'create', '--profile', 'main', '--parent-id', PARENT_ID])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('evidence-folder create with a --parent-id that is not a UUID exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evidence-folder', 'create', '--profile', 'main', '--name', 'Policies', '--parent-id', 'root',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-parent-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('the documented 409 conflict on folder create is passed through with its message and secrets never appear in output', async () => {
  api.enqueue({
    status: 409,
    body: {
      title: 'Conflict',
      status: 409,
      detail: `A folder named Policies already exists in this parent (${TEST_SECRET})`,
    },
  })

  const result = await run(['evidence-folder', 'create', '--profile', 'main', '--name', 'Policies'])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.httpStatus, 409)
  assert.equal(error.apiError.title, 'Conflict')
  assert.match(error.apiError.detail, /already exists/)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('an evidence-folder create is not retried on a transient status, because retrying could duplicate the folder', async () => {
  api.enqueue({status: 503, body: {message: 'down'}})
  const requestsBefore = api.requests.length

  const result = await run(['evidence-folder', 'create', '--profile', 'main', '--name', 'Policies'])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore + 1)
  assert.equal(JSON.parse(result.stderr).error.attempts, 1)
})

test('evidence-folder create --help lists every flag and the documented permission', async () => {
  const help = await run(['evidence-folder', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  for (const flag of ['--name', '--parent-id', '--profile']) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /Evidence:\s+Write/)
})
