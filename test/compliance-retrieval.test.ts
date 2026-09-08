/**
 * Process-level tests for the issue #5 compliance retrieval commands:
 * evaluation current, assessment-objective list, control list, and
 * evidence list. The evidence command selects its documented GET operation
 * from the supplied filters. Every command uses the guarded API runtime.
 */
import assert from 'node:assert/strict'
import {after, before, test} from 'node:test'

import {TEST_SECRET, createProfile, setupAuthContext, type AuthContext} from './helpers/auth-fixtures.ts'
import {startFakeApi, type FakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

const FRAMEWORK_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

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

test('evaluation current maps to GET /v1/Evaluations/Current with the tenant header', async () => {
  const evaluation = {id: 4242, name: 'FY26 CMMC L2', isCurrent: true, frameworks: [{id: FRAMEWORK_ID}]}
  api.enqueue({status: 200, body: evaluation})
  const requestsBefore = api.requests.length

  const result = await run(['evaluation', 'current', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  // JSON is the default format and preserves field names and shape.
  assert.equal(result.stdout, `${JSON.stringify(evaluation, null, 2)}\n`)

  assert.equal(api.requests.length, requestsBefore + 1)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, '/v1/Evaluations/Current')
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
})

test('assessment-objective list sends no query string when filters are omitted', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run(['assessment-objective', 'list', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, '/v1/AssessmentObjectives')
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
})

test('control list passes validated filters under their documented names', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'control', 'list', '--profile', 'main',
    '--evaluation-id', '42',
    '--framework-id', FRAMEWORK_ID,
  ])

  assert.equal(result.code, 0, result.stderr)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, `/v1/Controls?evaluationId=42&frameworkId=${FRAMEWORK_ID}`)
})

test('filtered evidence list maps to GET /v1/Evidence/Evaluation', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'evidence', 'list', '--profile', 'main', '--evaluation-id', '7',
  ])

  assert.equal(result.code, 0, result.stderr)
  const request = api.requests.at(-1)!
  assert.equal(request.method, 'GET')
  assert.equal(request.path, '/v1/Evidence/Evaluation?evaluationId=7')
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
})

test('evaluation current without --profile exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['evaluation', 'current'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /profile/i)
  assert.equal(api.requests.length, requestsBefore)
})

test('a single given filter appears alone in the query string', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'evidence', 'list', '--profile', 'main', '--framework-id', FRAMEWORK_ID,
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, `/v1/Evidence/Evaluation?frameworkId=${FRAMEWORK_ID}`)
})

test('an evaluation identifier is sent in canonical integer form', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'control', 'list', '--profile', 'main', '--evaluation-id', '007',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, '/v1/Controls?evaluationId=7')
})

test('a non-integer evaluation identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'control', 'list', '--profile', 'main', '--evaluation-id', 'seven',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-evaluation-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('evidence list rejects a non-integer evaluation identifier before network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'evidence', 'list', '--profile', 'main', '--evaluation-id', 'seven',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-evaluation-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('the removed evaluation evidence command uses unknown-command behavior', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['evidence', 'for-evaluation', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'command-not-found')
  assert.equal(api.requests.length, requestsBefore)
})

test('a non-UUID framework identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'assessment-objective', 'list', '--profile', 'main', '--framework-id', 'not-a-uuid',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-framework-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('jsonl output prints one valid JSON line per array element', async () => {
  const objectives = [
    {id: 'ao-1', name: 'AC.L2-3.1.1[a]', status: 'Met', associatedFrameworks: [FRAMEWORK_ID]},
    {id: 'ao-2', name: 'AC.L2-3.1.1[b]', status: 'Not Met'},
    {id: 'ao-3', name: 'AC.L2-3.1.1[c]', status: null},
  ]
  api.enqueue({status: 200, body: objectives})

  const result = await run([
    'assessment-objective', 'list', '--profile', 'main', '--output', 'jsonl',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  const lines = result.stdout.trimEnd().split('\n')
  assert.equal(lines.length, objectives.length)
  assert.deepEqual(lines.map((line) => JSON.parse(line)), objectives)
})

test('jsonl output prints a non-array response on one line', async () => {
  const evaluation = {id: 4242, frameworks: [{id: FRAMEWORK_ID}]}
  api.enqueue({status: 200, body: evaluation})

  const result = await run(['evaluation', 'current', '--profile', 'main', '--output', 'jsonl'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, `${JSON.stringify(evaluation)}\n`)
})

test('table output renders scalar columns and nested values as compact JSON', async () => {
  const controls = [
    {id: 'c-1', controlNumber: '3.1.1', title: 'Limit access', status: {name: 'Met'}},
    {id: 'c-2', controlNumber: '3.1.2', title: 'Limit functions', status: null},
  ]
  api.enqueue({status: 200, body: controls})

  const result = await run(['control', 'list', '--profile', 'main', '--output', 'table'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  const lines = result.stdout.trimEnd().split('\n')
  assert.equal(lines.length, 1 + controls.length)
  assert.match(lines[0], /^id\s+controlNumber\s+title\s+status$/)
  assert.match(lines[1], /^c-1\s+3\.1\.1\s+Limit access\s+\{"name":"Met"\}$/)
  assert.match(lines[2], /^c-2\s+3\.1\.2\s+Limit functions$/)
})

test('tenant list supports the shared jsonl format', async () => {
  const tenants = [
    {id: 'tenant-main', name: 'Tenant Main'},
    {id: 'tenant-other', name: 'Tenant Other'},
  ]
  api.enqueue({status: 200, body: tenants})

  const result = await run(['tenant', 'list', '--profile', 'main', '--output', 'jsonl'])

  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.trimEnd().split('\n')
  assert.deepEqual(lines.map((line) => JSON.parse(line)), tenants)
})

test('a 403 names the documented permission without claiming the profile holds it', async () => {
  api.enqueue({status: 403, body: {title: 'Forbidden', status: 403}})

  const result = await run(['evidence', 'list', '--profile', 'main'])

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'authentication-failed')
  assert.match(error.message, /Evidence: Read/)
})

test('help output shows the documented permission', async () => {
  const evaluationHelp = await run(['evaluation', 'current', '--help'])
  assert.equal(evaluationHelp.code, 0)
  assert.match(evaluationHelp.stdout, /Evaluations: Read/)
  assert.match(evaluationHelp.stdout, /does not check/)

  const controlHelp = await run(['control', 'list', '--help'])
  assert.equal(controlHelp.code, 0)
  assert.match(controlHelp.stdout, /GapAnalysis: Read/)
})

test('the current-evaluation identifier chains through the three list commands', async () => {
  const evaluation = {id: 8081, name: 'FY26 CMMC L2', isCurrent: true}
  api.enqueue({status: 200, body: evaluation})

  const current = await run(['evaluation', 'current', '--profile', 'main'])
  assert.equal(current.code, 0, current.stderr)
  const evaluationId = String((JSON.parse(current.stdout) as {id: number}).id)

  const chained: Array<[string[], string]> = [
    [['assessment-objective', 'list'], '/v1/AssessmentObjectives'],
    [['control', 'list'], '/v1/Controls'],
    [['evidence', 'list'], '/v1/Evidence/Evaluation'],
  ]
  for (const [argv, path] of chained) {
    api.enqueue({status: 200, body: [{id: `${path}-row`}]})
    const result = await run([...argv, '--profile', 'main', '--evaluation-id', evaluationId])
    assert.equal(result.code, 0, result.stderr)
    assert.equal(api.requests.at(-1)!.path, `${path}?evaluationId=${evaluationId}`)
  }
})
