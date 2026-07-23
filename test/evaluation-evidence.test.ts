/**
 * Process-level tests for the issue #6 evaluation and evidence commands:
 * evaluation list, assessment-objective history, lookup assessment-objective
 * statuses, evidence list, evidence-folder list, and the three Intelligent
 * Control Library (ICL) lookup commands. Each command maps to one documented
 * GET operation through the guarded API runtime.
 */
import assert from 'node:assert/strict'
import {after, before, test} from 'node:test'

import {TEST_SECRET, createProfile, setupAuthContext, type AuthContext} from './helpers/auth-fixtures.ts'
import {startFakeApi, type FakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

const OBJECTIVE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const PARENT_ID = '9b2f0c44-1111-4222-8333-abcdefabcdef'
const ICL_VERSION_ID = '0e7b1a58-4444-4555-9666-fedcbafedcba'

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

test('evaluation list maps to GET /v1/Evaluations with the tenant header', async () => {
  const evaluations = [
    {id: 4242, name: 'FY26 CMMC L2', isCurrent: true},
    {id: 4243, name: 'FY25 CMMC L2', isCurrent: false},
  ]
  api.enqueue({status: 200, body: evaluations})
  const requestsBefore = api.requests.length

  const result = await run(['evaluation', 'list', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(evaluations, null, 2)}\n`)

  assert.equal(api.requests.length, requestsBefore + 1)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, '/v1/Evaluations')
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
})

test('assessment-objective history sends the required objective identifier', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'assessment-objective', 'history', '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_ID,
  ])

  assert.equal(result.code, 0, result.stderr)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, `/v1/AssessmentObjectives/History?assessmentObjectiveId=${OBJECTIVE_ID}`)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
})

test('assessment-objective history appends the optional evaluation filter in canonical form', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'assessment-objective', 'history', '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_ID,
    '--evaluation-id', '007',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(
    api.requests.at(-1)!.path,
    `/v1/AssessmentObjectives/History?assessmentObjectiveId=${OBJECTIVE_ID}&evaluationId=7`,
  )
})

test('assessment-objective history without the objective identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['assessment-objective', 'history', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /assessment-objective-id/i)
  assert.equal(api.requests.length, requestsBefore)
})

test('a non-UUID objective identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'assessment-objective', 'history', '--profile', 'main',
    '--assessment-objective-id', 'not-a-uuid',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-assessment-objective-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a non-integer evaluation filter on history exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'assessment-objective', 'history', '--profile', 'main',
    '--assessment-objective-id', OBJECTIVE_ID,
    '--evaluation-id', 'seven',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-evaluation-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('lookup assessment-objective statuses maps to the documented lookups path', async () => {
  const statuses = [
    {id: 1, name: 'Not Assessed'},
    {id: 2, name: 'In Place'},
  ]
  api.enqueue({status: 200, body: statuses})

  const result = await run(['lookup', 'assessment-objective', 'statuses', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, `${JSON.stringify(statuses, null, 2)}\n`)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, '/v1/lookups/assessmentobjectives/statuses')
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
})

test('evidence list maps to GET /v1/Evidence with no query string', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run(['evidence', 'list', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, '/v1/Evidence')
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
})

test('evidence-folder list omits parentId when the flag is absent', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run(['evidence-folder', 'list', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, '/v1/Evidence/Folders')
})

test('evidence-folder list sends a valid parentId under its documented name', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'evidence-folder', 'list', '--profile', 'main', '--parent-id', PARENT_ID,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, `/v1/Evidence/Folders?parentId=${PARENT_ID}`)
})

test('a non-UUID parent identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evidence-folder', 'list', '--profile', 'main', '--parent-id', 'not-a-uuid',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-parent-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('lookup icl-version list maps to GET /v1/lookups/iclversions', async () => {
  api.enqueue({status: 200, body: [{id: ICL_VERSION_ID, name: 'ICL 2026.1'}]})

  const result = await run(['lookup', 'icl-version', 'list', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, '/v1/lookups/iclversions')
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
})

test('lookup icl-version latest-frameworks maps to the latest-version operation', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run(['lookup', 'icl-version', 'latest-frameworks', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, '/v1/lookups/iclversions/frameworks')
})

test('lookup icl-version frameworks substitutes the version identifier into the path', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'lookup', 'icl-version', 'frameworks', '--profile', 'main',
    '--icl-version-id', ICL_VERSION_ID,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, `/v1/lookups/iclversions/${ICL_VERSION_ID}/frameworks`)
})

test('lookup icl-version frameworks without the version identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['lookup', 'icl-version', 'frameworks', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /icl-version-id/i)
  assert.equal(api.requests.length, requestsBefore)
})

test('a non-UUID ICL version identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'lookup', 'icl-version', 'frameworks', '--profile', 'main',
    '--icl-version-id', 'not-a-uuid',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-icl-version-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('jsonl output prints one valid JSON line per evaluation', async () => {
  const evaluations = [
    {id: 1, name: 'FY26 CMMC L2'},
    {id: 2, name: 'FY25 CMMC L2'},
  ]
  api.enqueue({status: 200, body: evaluations})

  const result = await run(['evaluation', 'list', '--profile', 'main', '--output', 'jsonl'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  const lines = result.stdout.trimEnd().split('\n')
  assert.deepEqual(lines.map((line) => JSON.parse(line)), evaluations)
})

test('table output renders evidence folders with nested values as compact JSON', async () => {
  const folders = [
    {id: 'f-1', name: 'Policies', parent: {id: 'f-0'}},
    {id: 'f-2', name: 'Screenshots', parent: null},
  ]
  api.enqueue({status: 200, body: folders})

  const result = await run(['evidence-folder', 'list', '--profile', 'main', '--output', 'table'])

  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.trimEnd().split('\n')
  assert.equal(lines.length, 1 + folders.length)
  assert.match(lines[0], /^id\s+name\s+parent$/)
  assert.match(lines[1], /^f-1\s+Policies\s+\{"id":"f-0"\}$/)
  assert.match(lines[2], /^f-2\s+Screenshots$/)
})

test('a 403 on an ICL command names the documented permission without claiming the profile holds it', async () => {
  api.enqueue({status: 403, body: {title: 'Forbidden', status: 403}})

  const result = await run(['lookup', 'icl-version', 'list', '--profile', 'main'])

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'authentication-failed')
  assert.match(error.message, /Evaluations: Read/)
})

test('help output shows the documented permission for each area', async () => {
  const historyHelp = await run(['assessment-objective', 'history', '--help'])
  assert.equal(historyHelp.code, 0)
  assert.match(historyHelp.stdout, /GapAnalysis: Read/)
  assert.match(historyHelp.stdout, /does not check/)

  const evidenceHelp = await run(['evidence-folder', 'list', '--help'])
  assert.equal(evidenceHelp.code, 0)
  assert.match(evidenceHelp.stdout, /Evidence: Read/)

  const iclHelp = await run(['lookup', 'icl-version', 'frameworks', '--help'])
  assert.equal(iclHelp.code, 0)
  assert.match(iclHelp.stdout, /Evaluations: Read/)
})
