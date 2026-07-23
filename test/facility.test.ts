/**
 * Process-level tests for the issue #9 facility retrieval commands:
 * facility list, facility get, facility data-types, and four facility
 * lookups. Each command maps to one documented GET operation through the
 * guarded API runtime. None of the seven operations documents a query
 * parameter; facility get and facility data-types substitute a documented
 * int32 path identifier. Every operation documents the permission
 * "Locations: Read".
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

/** Sample identifier the mapping and help tests share for the id commands. */
const SAMPLE_FACILITY_ID = '42'

/**
 * The 7 documented mappings with their documented permission. Each
 * command sends one GET request to the exact case-sensitive path with no
 * query string. The facility get and facility data-types entries
 * substitute their integer argument into the documented path.
 */
const MAPPINGS: Array<[string[], string, string]> = [
  [['facility', 'list'], '/v1/Facilities', 'Locations: Read'],
  [['facility', 'get', SAMPLE_FACILITY_ID], '/v1/Facilities/42', 'Locations: Read'],
  [
    ['facility', 'data-types', SAMPLE_FACILITY_ID],
    '/v1/Facilities/42/datatypes',
    'Locations: Read',
  ],
  [['lookup', 'facility', 'types'], '/v1/lookups/facilities/types', 'Locations: Read'],
  [['lookup', 'facility', 'states'], '/v1/lookups/facilities/states', 'Locations: Read'],
  [['lookup', 'facility', 'data-types'], '/v1/lookups/facilities/datatypes', 'Locations: Read'],
  [
    ['lookup', 'facility', 'asset-categories'],
    '/v1/lookups/facilities/assetcategories',
    'Locations: Read',
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

test('facility get sends the identifier in canonical integer form and preserves the object body', async () => {
  const body = {id: 7, name: 'Headquarters'}
  api.enqueue({status: 200, body})

  const result = await run(['facility', 'get', '007', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, `${JSON.stringify(body, null, 2)}\n`)
  assert.equal(api.requests.at(-1)!.path, '/v1/Facilities/7')
})

test('facility data-types sends the identifier in canonical integer form', async () => {
  const body = [{id: 3, name: 'CUI'}]
  api.enqueue({status: 200, body})

  const result = await run(['facility', 'data-types', '007', '--profile', 'main'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(api.requests.at(-1)!.path, '/v1/Facilities/7/datatypes')
})

for (const command of ['get', 'data-types']) {
  test(`a non-integer facility identifier on facility ${command} exits 2 before any network access`, async () => {
    const requestsBefore = api.requests.length

    const result = await run(['facility', command, 'seven', '--profile', 'main'])

    assert.equal(result.code, 2)
    assert.equal(result.stdout, '')
    assert.equal(JSON.parse(result.stderr).error.code, 'invalid-facility-id')
    assert.equal(api.requests.length, requestsBefore)
  })

  test(`a facility identifier beyond the documented int32 range on facility ${command} exits 2 before any network access`, async () => {
    const requestsBefore = api.requests.length

    const result = await run(['facility', command, '2147483648', '--profile', 'main'])

    assert.equal(result.code, 2)
    assert.equal(result.stdout, '')
    assert.equal(JSON.parse(result.stderr).error.code, 'invalid-facility-id')
    assert.equal(api.requests.length, requestsBefore)
  })

  test(`facility ${command} without an identifier exits 2 before any network access`, async () => {
    const requestsBefore = api.requests.length

    const result = await run(['facility', command, '--profile', 'main'])

    assert.equal(result.code, 2)
    assert.equal(result.stdout, '')
    assert.notEqual(result.stderr, '')
    assert.equal(api.requests.length, requestsBefore)
  })
}

test('jsonl output prints one valid JSON line per facility', async () => {
  const facilities = [
    {id: 1, name: 'Headquarters'},
    {id: 2, name: 'Manufacturing Plant'},
  ]
  api.enqueue({status: 200, body: facilities})

  const result = await run(['facility', 'list', '--profile', 'main', '--output', 'jsonl'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  const lines = result.stdout.trimEnd().split('\n')
  assert.deepEqual(lines.map((line) => JSON.parse(line)), facilities)
})

test('table output renders facility types as aligned columns', async () => {
  const types = [
    {id: 1, name: 'Office'},
    {id: 2, name: 'Data Center'},
  ]
  api.enqueue({status: 200, body: types})

  const result = await run([
    'lookup', 'facility', 'types', '--profile', 'main', '--output', 'table',
  ])

  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.trimEnd().split('\n')
  assert.equal(lines.length, 1 + types.length)
  assert.match(lines[0], /^id\s+name$/)
  assert.match(lines[1], /^1\s+Office$/)
  assert.match(lines[2], /^2\s+Data Center$/)
})

test('a 403 on a facility command names the documented Locations permission', async () => {
  api.enqueue({status: 403, body: {title: 'Forbidden', status: 403}})

  const result = await run(['facility', 'list', '--profile', 'main'])

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'authentication-failed')
  assert.match(error.message, /Locations: Read/)
})

test('a documented 404 on facility get exits 7 with the not-found code', async () => {
  api.enqueue({status: 404, body: {title: 'Not Found', status: 404}})

  const result = await run(['facility', 'get', '42', '--profile', 'main'])

  assert.equal(result.code, 7)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
})

test('help output shows the documented permission for every issue #9 command', async () => {
  for (const [argv, , permission] of MAPPINGS) {
    // Drop the positional identifier so the help invocation stays uniform.
    const commandWords = argv.filter((word) => word !== SAMPLE_FACILITY_ID)
    const help = await run([...commandWords, '--help'])
    assert.equal(help.code, 0, help.stderr)
    // Help text wraps lines, so allow a line break inside the permission.
    const [area, level] = permission.split(': ')
    assert.match(help.stdout, new RegExp(`${area}:\\s+${level}`), commandWords.join(' '))
    // The help must not claim the profile holds the permission.
    assert.match(help.stdout, /does\s+not\s+check/, commandWords.join(' '))
  }
})
