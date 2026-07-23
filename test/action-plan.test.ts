/**
 * Process-level tests for the issue #7 action-plan retrieval commands:
 * action-plan-project list, action-plan-task list, action-plan-subtask
 * list, and the eight action-plan lookup commands. Each command maps to
 * one documented GET operation through the guarded API runtime. The
 * project and task commands preserve the server's documented Boolean
 * defaults by omitting flags that the caller did not supply.
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

/**
 * The 11 documented mappings. Each command sends one GET request to the
 * exact case-sensitive path with no query string when every optional
 * flag is omitted, so the server applies its documented defaults.
 */
const MAPPINGS: Array<[string[], string]> = [
  [['action-plan-project', 'list'], '/v1/ActionPlanProjects'],
  [['action-plan-task', 'list'], '/v1/ActionPlanTasks'],
  [['action-plan-subtask', 'list'], '/v1/ActionPlanSubTasks'],
  [['lookup', 'action-plan', 'project-statuses'], '/v1/lookups/actionplan/projectstatuses'],
  [['lookup', 'action-plan', 'task-statuses'], '/v1/lookups/actionplan/taskstatuses'],
  [['lookup', 'action-plan', 'subtask-statuses'], '/v1/lookups/actionplan/subtaskstatuses'],
  [['lookup', 'action-plan', 'task-types'], '/v1/lookups/actionplan/tasktypes'],
  [['lookup', 'action-plan', 'levels-of-effort'], '/v1/lookups/actionplan/levelsofeffort'],
  [['lookup', 'action-plan', 'priority-levels'], '/v1/lookups/actionplan/prioritylevels'],
  [['lookup', 'action-plan', 'categories'], '/v1/lookups/actionplan/categories'],
  [['lookup', 'action-plan', 'subcategories'], '/v1/lookups/actionplan/subcategories'],
]

for (const [argv, path] of MAPPINGS) {
  test(`${argv.join(' ')} maps to GET ${path} with the tenant header and no query string`, async () => {
    const body = [{id: 1, name: 'Sample'}]
    api.enqueue({status: 200, body})
    const requestsBefore = api.requests.length

    const result = await run([...argv, '--profile', 'main'])

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stderr, '')
    assert.equal(result.stdout, `${JSON.stringify(body, null, 2)}\n`)

    assert.equal(api.requests.length, requestsBefore + 1)
    const request = api.requests.at(-1)!
    assert.equal(request.method, 'GET')
    assert.equal(request.path, path)
    assert.equal(request.headers['x-client-id'], 'client-main')
    assert.equal(request.headers['x-client-secret'], TEST_SECRET)
    assert.equal(request.headers['x-tenant-id'], 'tenant-main')
  })
}

test('action-plan-project list sends explicit Boolean values under the documented names', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'action-plan-project', 'list', '--profile', 'main',
    '--include-tasks', 'false',
    '--include-subtasks', 'true',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(
    api.requests.at(-1)!.path,
    '/v1/ActionPlanProjects?includeTasks=false&includeSubTasks=true',
  )
})

test('action-plan-project list combines the evaluation filter in canonical form with one Boolean', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'action-plan-project', 'list', '--profile', 'main',
    '--evaluation-id', '007',
    '--include-tasks', 'true',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(
    api.requests.at(-1)!.path,
    '/v1/ActionPlanProjects?evaluationId=7&includeTasks=true',
  )
})

test('action-plan-task list sends the documented includeSubTasks value', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'action-plan-task', 'list', '--profile', 'main',
    '--include-subtasks', 'false',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, '/v1/ActionPlanTasks?includeSubTasks=false')
})

test('action-plan-subtask list appends the optional evaluation filter', async () => {
  api.enqueue({status: 200, body: []})

  const result = await run([
    'action-plan-subtask', 'list', '--profile', 'main',
    '--evaluation-id', '4242',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, '/v1/ActionPlanSubTasks?evaluationId=4242')
})

test('a non-Boolean include-tasks value exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-project', 'list', '--profile', 'main',
    '--include-tasks', 'yes',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /include-tasks/i)
  assert.equal(api.requests.length, requestsBefore)
})

test('a non-Boolean include-subtasks value on task list exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-task', 'list', '--profile', 'main',
    '--include-subtasks', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /include-subtasks/i)
  assert.equal(api.requests.length, requestsBefore)
})

test('a non-integer evaluation filter on project list exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-project', 'list', '--profile', 'main',
    '--evaluation-id', 'seven',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-evaluation-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('jsonl output prints one valid JSON line per action-plan project', async () => {
  const projects = [
    {id: 1, name: 'POA&M Remediation'},
    {id: 2, name: 'SSP Refresh'},
  ]
  api.enqueue({status: 200, body: projects})

  const result = await run([
    'action-plan-project', 'list', '--profile', 'main', '--output', 'jsonl',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  const lines = result.stdout.trimEnd().split('\n')
  assert.deepEqual(lines.map((line) => JSON.parse(line)), projects)
})

test('table output renders priority levels as aligned columns', async () => {
  const levels = [
    {id: 1, name: 'Low'},
    {id: 2, name: 'Critical'},
  ]
  api.enqueue({status: 200, body: levels})

  const result = await run([
    'lookup', 'action-plan', 'priority-levels', '--profile', 'main', '--output', 'table',
  ])

  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.trimEnd().split('\n')
  assert.equal(lines.length, 1 + levels.length)
  assert.match(lines[0], /^id\s+name$/)
  assert.match(lines[1], /^1\s+Low$/)
  assert.match(lines[2], /^2\s+Critical$/)
})

test('a 403 on an action-plan command names the documented permission without claiming the profile holds it', async () => {
  api.enqueue({status: 403, body: {title: 'Forbidden', status: 403}})

  const result = await run(['action-plan-project', 'list', '--profile', 'main'])

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'authentication-failed')
  assert.match(error.message, /ActionPlan: Read/)
})

test('help output shows the documented permission for every issue #7 command', async () => {
  for (const [argv] of MAPPINGS) {
    const help = await run([...argv, '--help'])
    assert.equal(help.code, 0, help.stderr)
    // Help text wraps lines, so allow a line break inside the permission.
    assert.match(help.stdout, /ActionPlan:\s+Read/, argv.join(' '))
    // The help must not claim the profile holds the permission.
    assert.match(help.stdout, /does\s+not\s+check/, argv.join(' '))
  }
})
