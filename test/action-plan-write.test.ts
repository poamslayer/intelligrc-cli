/**
 * Process-level tests for the issue #45 Action Plan create commands:
 * action-plan-project create (POST /v1/ActionPlanProjects),
 * action-plan-task create (POST /v1/ActionPlanTasks), and
 * action-plan-subtask create (POST /v1/ActionPlanSubTasks). Each command sends
 * its documented create body through the guarded write runtime and prints the
 * created record.
 *
 * For each command a comprehensive request proves every scalar and array field
 * maps with its documented item type (including the int32 assignment arrays,
 * the task's uuid assessment-objective array, the date-time and number fields,
 * and the boolean organization flag); a minimal request proves only the
 * required fields are sent and every optional field is omitted when its flag is
 * absent. A missing required flag or an invalid integer, number, date, or uuid
 * in any field exits 2 (invalid input) before any network or secrets file access.
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

const PROJECT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const TASK_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const OBJECTIVE_A = '11111111-2222-3333-4444-555555555555'
const OBJECTIVE_B = '99999999-8888-7777-6666-555555555555'

const CREATED = {id: 1, name: 'X'}

function assertCredentialHeaders(request: {headers: Record<string, string | string[] | undefined>}): void {
  assert.equal(request.headers['x-client-id'], 'client-main')
  assert.equal(request.headers['x-client-secret'], TEST_SECRET)
  assert.equal(request.headers['x-tenant-id'], 'tenant-main')
}

// ---------------------------------------------------------------------------
// action-plan-project create (POST /v1/ActionPlanProjects)
// ---------------------------------------------------------------------------

test('action-plan-project create sends POST /v1/ActionPlanProjects with the complete body and prints the created record', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'action-plan-project', 'create', '--profile', 'main',
    '--name', 'Remediation', '--description', 'Close the gaps', '--status-id', '1',
    '--cost-estimate', '1000.50', '--due-date', '2026-08-01', '--evaluation-id', '5',
    '--assigned-department-id', '10', '--assigned-department-id', '11',
    '--assigned-personnel-id', '12',
    '--assigned-watcher-id', '13',
    '--level-of-effort-id', '2', '--priority-level-id', '3', '--sub-category-id', '4',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(CREATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/ActionPlanProjects')
  assert.match(String(request.headers['content-type']), /application\/json/)
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    name: 'Remediation',
    description: 'Close the gaps',
    statusId: 1,
    costEstimate: 1000.5,
    dueDate: '2026-08-01T00:00:00Z',
    evaluationId: 5,
    assignedDepartmentIds: [10, 11],
    assignedPersonnelIds: [12],
    assignedWatcherIds: [13],
    levelOfEffortId: 2,
    priorityLevelId: 3,
    subCategoryId: 4,
  })
})

test('action-plan-project create sends only the required fields when no optional flag is given', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'action-plan-project', 'create', '--profile', 'main',
    '--name', 'P', '--description', 'D', '--status-id', '1',
  ])

  assert.deepEqual(api.requests.at(-1)!.body, {name: 'P', description: 'D', statusId: 1})
})

test('action-plan-project create without --name exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-project', 'create', '--profile', 'main',
    '--description', 'D', '--status-id', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('action-plan-project create with a non-integer status id exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-project', 'create', '--profile', 'main',
    '--name', 'P', '--description', 'D', '--status-id', 'open',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-status-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('action-plan-project create with a malformed due date exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-project', 'create', '--profile', 'main',
    '--name', 'P', '--description', 'D', '--status-id', '1', '--due-date', '2026-13-40',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-due-date')
  assert.equal(api.requests.length, requestsBefore)
})

test('action-plan-project create with a non-integer assignment array element exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-project', 'create', '--profile', 'main',
    '--name', 'P', '--description', 'D', '--status-id', '1',
    '--assigned-department-id', '10', '--assigned-department-id', 'ten',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-assigned-department-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('a project create API error is passed through with exit 8 and secrets never appear in output', async () => {
  api.enqueue({status: 400, body: {title: 'Bad Request', status: 400, detail: `rejected for ${TEST_SECRET}`}})

  const result = await run([
    'action-plan-project', 'create', '--profile', 'main',
    '--name', 'P', '--description', 'D', '--status-id', '1',
  ])

  assert.equal(result.code, 8)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.httpStatus, 400)
  assert.ok(!result.stderr.includes(TEST_SECRET))
})

test('action-plan-project create --help lists representative flags and the documented permission', async () => {
  const help = await run(['action-plan-project', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  for (const flag of ['--name', '--description', '--status-id', '--assigned-department-id', '--due-date', '--profile']) {
    assert.match(help.stdout, new RegExp(flag), `help must list ${flag}`)
  }

  assert.match(help.stdout, /\(required\)/)
  assert.match(help.stdout, /ActionPlan:\s+Write/)
})

// ---------------------------------------------------------------------------
// action-plan-task create (POST /v1/ActionPlanTasks)
// ---------------------------------------------------------------------------

test('action-plan-task create sends POST /v1/ActionPlanTasks with the complete body and prints the created record', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'action-plan-task', 'create', '--profile', 'main',
    '--name', 'Patch servers', '--description', 'Apply updates', '--status-id', '1', '--task-type-id', '2',
    '--budget', '2000', '--scheduled-completion-date', '2026-09-15',
    '--project-id', PROJECT_ID, '--evaluation-id', '5',
    '--assigned-department-id', '10',
    '--assigned-personnel-id', '12',
    '--assigned-watcher-id', '13',
    '--assigned-assessment-objective-id', OBJECTIVE_A, '--assigned-assessment-objective-id', OBJECTIVE_B,
    '--level-of-effort-id', '2', '--priority-level-id', '3', '--sub-category-id', '4',
    '--is-assigned-to-organization', 'true', '--assigned-external-organization', 'Acme MSP',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, `${JSON.stringify(CREATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/ActionPlanTasks')
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    name: 'Patch servers',
    description: 'Apply updates',
    statusId: 1,
    taskTypeId: 2,
    budget: 2000,
    scheduledCompletionDate: '2026-09-15T00:00:00Z',
    projectId: PROJECT_ID,
    evaluationId: 5,
    assignedDepartmentIds: [10],
    assignedPersonnelIds: [12],
    assignedWatcherIds: [13],
    assignedAssessmentObjectiveIds: [OBJECTIVE_A, OBJECTIVE_B],
    levelOfEffortId: 2,
    priorityLevelId: 3,
    subCategoryId: 4,
    isAssignedToOrganization: true,
    assignedExternalOrganization: 'Acme MSP',
  })
})

test('action-plan-task create sends only the required fields when no optional flag is given', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'action-plan-task', 'create', '--profile', 'main',
    '--name', 'T', '--description', 'D', '--status-id', '1', '--task-type-id', '2',
  ])

  assert.deepEqual(api.requests.at(-1)!.body, {name: 'T', description: 'D', statusId: 1, taskTypeId: 2})
})

test('action-plan-task create without --task-type-id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-task', 'create', '--profile', 'main',
    '--name', 'T', '--description', 'D', '--status-id', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('action-plan-task create with a malformed project uuid exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-task', 'create', '--profile', 'main',
    '--name', 'T', '--description', 'D', '--status-id', '1', '--task-type-id', '2',
    '--project-id', 'not-a-uuid',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-project-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('action-plan-task create with a malformed assessment objective uuid exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-task', 'create', '--profile', 'main',
    '--name', 'T', '--description', 'D', '--status-id', '1', '--task-type-id', '2',
    '--assigned-assessment-objective-id', OBJECTIVE_A, '--assigned-assessment-objective-id', 'nope',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-assigned-assessment-objective-id')
  assert.equal(api.requests.length, requestsBefore)
})

// ---------------------------------------------------------------------------
// action-plan-subtask create (POST /v1/ActionPlanSubTasks)
// ---------------------------------------------------------------------------

test('action-plan-subtask create sends POST /v1/ActionPlanSubTasks with the complete body and prints the created record', async () => {
  api.enqueue({status: 201, body: CREATED})

  const result = await run([
    'action-plan-subtask', 'create', '--profile', 'main',
    '--title', 'Reboot', '--description', 'Reboot the host', '--task-id', TASK_ID, '--status-id', '1',
    '--cost-estimate', '500', '--scheduled-completion-date', '2026-10-01',
    '--assigned-department-id', '10',
    '--assigned-personnel-id', '12',
    '--assigned-watcher-id', '13',
    '--level-of-effort-id', '2', '--priority-level-id', '3', '--sub-category-id', '4',
    '--is-assigned-to-organization', 'false', '--assigned-external-organization', 'Beta LLC',
  ])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, `${JSON.stringify(CREATED, null, 2)}\n`)

  const request = api.requests.at(-1)!
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/v1/ActionPlanSubTasks')
  assertCredentialHeaders(request)
  assert.deepEqual(request.body, {
    title: 'Reboot',
    description: 'Reboot the host',
    taskId: TASK_ID,
    statusId: 1,
    costEstimate: 500,
    scheduledCompletionDate: '2026-10-01T00:00:00Z',
    assignedDepartmentIds: [10],
    assignedPersonnelIds: [12],
    assignedWatcherIds: [13],
    levelOfEffortId: 2,
    priorityLevelId: 3,
    subCategoryId: 4,
    isAssignedToOrganization: false,
    assignedExternalOrganization: 'Beta LLC',
  })
})

test('action-plan-subtask create sends only the required fields when no optional flag is given', async () => {
  api.enqueue({status: 201, body: CREATED})

  await run([
    'action-plan-subtask', 'create', '--profile', 'main',
    '--title', 'S', '--description', 'D', '--task-id', TASK_ID, '--status-id', '1',
  ])

  assert.deepEqual(api.requests.at(-1)!.body, {
    title: 'S',
    description: 'D',
    taskId: TASK_ID,
    statusId: 1,
  })
})

test('action-plan-subtask create without --task-id exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-subtask', 'create', '--profile', 'main',
    '--title', 'S', '--description', 'D', '--status-id', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('action-plan-subtask create with a malformed task uuid exits 2 with a stable code and no network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run([
    'action-plan-subtask', 'create', '--profile', 'main',
    '--title', 'S', '--description', 'D', '--task-id', 'not-a-uuid', '--status-id', '1',
  ])

  assert.equal(result.code, 2)
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-task-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('action-plan-subtask create --help shows the documented permission', async () => {
  const help = await run(['action-plan-subtask', 'create', '--help'])

  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stdout, /--title/)
  assert.match(help.stdout, /--task-id/)
  assert.match(help.stdout, /ActionPlan:\s+Write/)
})
