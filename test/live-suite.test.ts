/**
 * Proves the live-suite runner's orchestration against the local fake API
 * with fake credentials: complete catalog coverage, seed-driven cases,
 * explicit skips for missing source records, read-only traffic, and a
 * report free of credential and tenant values. No live host is contacted.
 */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'

import {FakeApi, type FakeResponse, type RecordedRequest} from './helpers/fake-api.ts'
import {fakeKeyringEnv, isolatedEnv, projectRoot} from './helpers/run-cli.ts'

const LIVE_CLIENT_ID = 'live-client-id-3f6f4f1e'
const LIVE_CLIENT_SECRET = 'live-client-secret-9d2f0b7c'
const LIVE_TENANT_ID = 'tenant-live-5a7e'
const LIVE_TENANT_NAME = 'Live Fixture Tenant'

interface RunnerResult {
  stdout: string
  stderr: string
  code: number | null
}

/** Run the live-suite runner as a child process against the fake API. */
function runSuite(api: FakeApi, workDir: string): Promise<RunnerResult> {
  const home = mkdtempSync(join(tmpdir(), 'intelligrc-live-test-'))
  const env = {
    ...isolatedEnv(home),
    ...fakeKeyringEnv(join(home, 'fake-keyring.json')),
    INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1',
    INTELLIGRC_LIVE_CLIENT_ID: LIVE_CLIENT_ID,
    INTELLIGRC_LIVE_CLIENT_SECRET: LIVE_CLIENT_SECRET,
    INTELLIGRC_LIVE_BASE_URL: api.url,
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(projectRoot, 'test', 'live', 'live-suite.ts')],
      {cwd: workDir, env, stdio: ['ignore', 'pipe', 'pipe']},
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({stdout, stderr, code}))
  })
}

/** A fixture UUID for the resources whose contract documents UUID ids. */
const FIXTURE_UUID = '4dee02b3-1c6e-4d0c-9e1f-2a7b8c9d0e1f'

/** Route requests by path for a populated fixture tenant. */
function populatedResponder(request: RecordedRequest): FakeResponse {
  const path = request.path.split('?')[0]
  if (path === '/v1/Tenants') {
    return {status: 200, body: [{id: LIVE_TENANT_ID, name: LIVE_TENANT_NAME}]}
  }

  if (path === '/v1/Evaluations/Current') {
    return {status: 200, body: {id: 71, name: 'Current evaluation'}}
  }

  // The contract documents UUID identifiers for assessment objectives,
  // evidence folders, and Intelligent Control Library versions.
  if (
    path === '/v1/AssessmentObjectives' ||
    path === '/v1/Evidence/Folders' ||
    path === '/v1/lookups/iclversions'
  ) {
    return {status: 200, body: [{id: FIXTURE_UUID, name: 'Fixture record'}]}
  }

  // Every other list endpoint returns one record with an integer id so
  // seeded cases run instead of skipping.
  return {status: 200, body: [{id: 7, name: 'Fixture record'}]}
}

interface Report {
  cases: Array<{command: string; status: string; skipReason?: string}>
  coverage: {apiCommands: number; covered: number; uncovered: string[]; permissionsSampled: string[]}
  observations: {pagination: string[]; conflicts: unknown[]}
}

function readReport(workDir: string): Report {
  return JSON.parse(readFileSync(join(workDir, 'live-report.json'), 'utf8')) as Report
}

test('the populated path covers every catalog command and stays read-only', {timeout: 300_000}, async () => {
  const api = new FakeApi()
  await api.start()
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-live-report-'))
  try {
    api.respondWith(populatedResponder)

    const result = await runSuite(api, workDir)
    assert.equal(result.code, 0, result.stderr)

    const report = readReport(workDir)

    // Every API command in the catalog has a case record. `evidence list`
    // has two, one per documented operation it can send, so the case count
    // is one more than the command count.
    assert.equal(report.coverage.uncovered.length, 0)
    assert.equal(report.coverage.covered, report.coverage.apiCommands)
    const commandCases = report.cases.filter(
      (c) => c.command !== 'auth login' && c.command !== 'doctor',
    )
    assert.equal(new Set(commandCases.map((c) => c.command)).size, report.coverage.apiCommands)
    assert.equal(commandCases.length, report.coverage.apiCommands + 1)
    assert.equal(commandCases.filter((c) => c.command === 'evidence list').length, 2)

    // The populated fixture leaves no skips and no failures.
    assert.deepEqual(
      report.cases.filter((c) => c.status !== 'pass'),
      [],
    )

    // Every documented permission area was sampled.
    assert.deepEqual(report.coverage.permissionsSampled, [
      'ActionPlan: Read',
      'Boundaries: Read',
      'DataTypes: Read',
      'Evaluations: Read',
      'Evidence: Read',
      'GapAnalysis: Read',
      'Interconnections: Read',
      'Locations: Read',
      'Personnel: Read',
    ])

    // Read-only traffic: the runner sent only GET requests.
    assert.ok(api.requests.length > 0)
    for (const request of api.requests) {
      assert.equal(request.method, 'GET')
    }

    // The report never contains credential or tenant values, and never
    // contains argument values (discovered record identifiers).
    const serialized = JSON.stringify(report)
    for (const secret of [LIVE_CLIENT_ID, LIVE_CLIENT_SECRET, LIVE_TENANT_ID, LIVE_TENANT_NAME]) {
      assert.ok(!serialized.includes(secret), `report contains ${secret}`)
    }

    // The runner removed its throwaway profile at the end.
    const authRequests = api.requests.filter((request) => request.path === '/v1/Tenants')
    assert.ok(authRequests.length >= 1)
  } finally {
    rmSync(workDir, {recursive: true, force: true})
    await api.close()
  }
})

test('an empty tenant produces explicit skips with non-secret reasons', {timeout: 300_000}, async () => {
  const api = new FakeApi()
  await api.start()
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-live-empty-'))
  try {
    api.respondWith((request) => {
      const path = request.path.split('?')[0]
      if (path === '/v1/Tenants') {
        return {status: 200, body: [{id: LIVE_TENANT_ID, name: LIVE_TENANT_NAME}]}
      }

      if (path === '/v1/Evaluations/Current') {
        // No current evaluation: an empty object carries no id.
        return {status: 200, body: {}}
      }

      return {status: 200, body: []}
    })

    const result = await runSuite(api, workDir)
    assert.equal(result.code, 0, result.stderr)

    const report = readReport(workDir)
    const skips = report.cases.filter((c) => c.status === 'skip')
    assert.ok(skips.length > 0, 'expected dependent cases to skip')
    for (const skip of skips) {
      assert.ok(skip.skipReason, `${skip.command} has no skip reason`)
      assert.match(skip.skipReason!, /^no .+ in the test tenant$/)
    }

    // Dependent commands skipped; none of them failed or passed silently.
    const dependent = report.cases.find((c) => c.command === 'assessment-objective list')
    assert.equal(dependent?.status, 'skip')
    assert.equal(dependent?.skipReason, 'no current evaluation in the test tenant')
  } finally {
    rmSync(workDir, {recursive: true, force: true})
    await api.close()
  }
})

test('a failed login writes no report and names no secret', {timeout: 300_000}, async () => {
  const api = new FakeApi()
  await api.start()
  const workDir = mkdtempSync(join(tmpdir(), 'intelligrc-live-denied-'))
  try {
    api.respondWith(() => ({status: 401, body: {message: 'unauthorized'}}))

    const result = await runSuite(api, workDir)
    assert.notEqual(result.code, 0)
    assert.ok(!existsSync(join(workDir, 'live-report.json')))
    for (const secret of [LIVE_CLIENT_SECRET, LIVE_CLIENT_ID]) {
      assert.ok(!result.stdout.includes(secret) && !result.stderr.includes(secret))
    }
  } finally {
    rmSync(workDir, {recursive: true, force: true})
    await api.close()
  }
})
