/**
 * Process-level tests for the issue #8 boundary and data-type retrieval
 * commands: boundary list, five boundary lookups, data-type list,
 * data-type get, and three data-type lookups. Each command maps to one
 * documented GET operation through the guarded API runtime. None of the
 * eleven operations documents a query parameter; data-type get is the
 * first command with a positional argument, a documented int32 path
 * identifier.
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
 * The 11 documented mappings with their documented permissions. Each
 * command sends one GET request to the exact case-sensitive path with no
 * query string. The data-type get entry substitutes its integer argument
 * into the documented path.
 */
const MAPPINGS: Array<[string[], string, string]> = [
  [['boundary', 'list'], '/v1/Boundaries', 'Boundaries: Read'],
  [
    ['lookup', 'boundary', 'operational-statuses'],
    '/v1/lookups/boundaries/operationalstatuses',
    'Boundaries: Read',
  ],
  [
    ['lookup', 'boundary', 'information-system-types'],
    '/v1/lookups/boundaries/informationsystemtypes',
    'Boundaries: Read',
  ],
  [
    ['lookup', 'boundary', 'confidentiality-levels'],
    '/v1/lookups/boundaries/confidentialitylevels',
    'Boundaries: Read',
  ],
  [
    ['lookup', 'boundary', 'integrity-levels'],
    '/v1/lookups/boundaries/integritylevels',
    'Boundaries: Read',
  ],
  [
    ['lookup', 'boundary', 'availability-levels'],
    '/v1/lookups/boundaries/availabilitylevels',
    'Boundaries: Read',
  ],
  [['data-type', 'get', '42'], '/v1/DataTypes/42', 'DataTypes: Read'],
  [['data-type', 'list'], '/v1/DataTypes', 'DataTypes: Read'],
  [
    ['lookup', 'data-type', 'confidentiality-levels'],
    '/v1/lookups/datatypes/confidentialitylevels',
    'DataTypes: Read',
  ],
  [
    ['lookup', 'data-type', 'integrity-levels'],
    '/v1/lookups/datatypes/integritylevels',
    'DataTypes: Read',
  ],
  [
    ['lookup', 'data-type', 'availability-levels'],
    '/v1/lookups/datatypes/availabilitylevels',
    'DataTypes: Read',
  ],
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

test('data-type get sends the identifier in canonical integer form', async () => {
  api.enqueue({status: 200, body: {id: 7, name: 'CUI'}})

  const result = await run(['data-type', 'get', '007', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(api.requests.at(-1)!.path, '/v1/DataTypes/7')
})

test('a non-integer data-type identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['data-type', 'get', 'seven', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid-data-type-id')
  assert.equal(api.requests.length, requestsBefore)
})

test('data-type get without an identifier exits 2 before any network access', async () => {
  const requestsBefore = api.requests.length

  const result = await run(['data-type', 'get', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.notEqual(result.stderr, '')
  assert.equal(api.requests.length, requestsBefore)
})

test('jsonl output prints one valid JSON line per boundary', async () => {
  const boundaries = [
    {id: 1, name: 'CUI Enclave'},
    {id: 2, name: 'Corporate Network'},
  ]
  api.enqueue({status: 200, body: boundaries})

  const result = await run(['boundary', 'list', '--profile', 'main', '--output', 'jsonl'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  const lines = result.stdout.trimEnd().split('\n')
  assert.deepEqual(lines.map((line) => JSON.parse(line)), boundaries)
})

test('table output renders operational statuses as aligned columns', async () => {
  const statuses = [
    {id: 1, name: 'Operational'},
    {id: 2, name: 'Under Development'},
  ]
  api.enqueue({status: 200, body: statuses})

  const result = await run([
    'lookup', 'boundary', 'operational-statuses', '--profile', 'main', '--output', 'table',
  ])

  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.trimEnd().split('\n')
  assert.equal(lines.length, 1 + statuses.length)
  assert.match(lines[0], /^id\s+name$/)
  assert.match(lines[1], /^1\s+Operational$/)
  assert.match(lines[2], /^2\s+Under Development$/)
})

test('a 403 on a boundary command names the documented Boundaries permission', async () => {
  api.enqueue({status: 403, body: {title: 'Forbidden', status: 403}})

  const result = await run(['boundary', 'list', '--profile', 'main'])

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'authentication-failed')
  assert.match(error.message, /Boundaries: Read/)
})

test('a 403 on a data-type command names the documented DataTypes permission', async () => {
  api.enqueue({status: 403, body: {title: 'Forbidden', status: 403}})

  const result = await run(['data-type', 'list', '--profile', 'main'])

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'authentication-failed')
  assert.match(error.message, /DataTypes: Read/)
})

test('help output shows the documented permission for every issue #8 command', async () => {
  for (const [argv, , permission] of MAPPINGS) {
    // Drop the positional identifier so the help invocation stays uniform.
    const commandWords = argv.filter((word) => word !== '42')
    const help = await run([...commandWords, '--help'])
    assert.equal(help.code, 0, help.stderr)
    // Help text wraps lines, so allow a line break inside the permission.
    const [area, level] = permission.split(': ')
    assert.match(help.stdout, new RegExp(`${area}:\\s+${level}`), commandWords.join(' '))
    // The help must not claim the profile holds the permission.
    assert.match(help.stdout, /does\s+not\s+check/, commandWords.join(' '))
  }
})
