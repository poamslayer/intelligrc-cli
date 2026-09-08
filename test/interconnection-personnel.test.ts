/**
 * Process-level tests for the issue #10 interconnection and personnel
 * retrieval commands: interconnection list, interconnection get,
 * interconnection data-types get, three interconnection lookups, personnel
 * list, and personnel get. Each command maps to one documented GET
 * operation through the guarded API runtime. None of the eight operations
 * documents a query parameter; the three identifier commands substitute a
 * documented int32 path identifier. The interconnection operations
 * document the permission "Interconnections: Read" and the personnel
 * operations document "Personnel: Read".
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
const SAMPLE_ID = '42'

/**
 * The 8 documented mappings with their documented permission. Each
 * command sends one GET request to the exact case-sensitive path with no
 * query string. The interconnection get, interconnection data-types get, and
 * personnel get entries substitute their integer argument into the
 * documented path.
 */
const MAPPINGS: Array<[string[], string, string]> = [
  [['interconnection', 'list'], '/v1/Interconnections', 'Interconnections: Read'],
  [['interconnection', 'get', SAMPLE_ID], '/v1/Interconnections/42', 'Interconnections: Read'],
  [
    ['interconnection', 'data-types', 'get', SAMPLE_ID],
    '/v1/Interconnections/42/datatypes',
    'Interconnections: Read',
  ],
  [
    ['lookup', 'interconnection', 'types'],
    '/v1/lookups/interconnections/types',
    'Interconnections: Read',
  ],
  [
    ['lookup', 'interconnection', 'authorization-types'],
    '/v1/lookups/interconnections/authorizationtypes',
    'Interconnections: Read',
  ],
  [
    ['lookup', 'interconnection', 'asset-categories'],
    '/v1/lookups/interconnections/assetcategories',
    'Interconnections: Read',
  ],
  [['personnel', 'list'], '/v1/Personnel', 'Personnel: Read'],
  [['personnel', 'get', SAMPLE_ID], '/v1/Personnel/42', 'Personnel: Read'],
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

/**
 * The three identifier commands with their path template and stable
 * invalid-input error code. Each substitutes the canonical integer form,
 * so "007" is sent as "7".
 */
const ID_COMMANDS: Array<[string[], string, string]> = [
  [['interconnection', 'get'], '/v1/Interconnections/7', 'invalid-interconnection-id'],
  [['interconnection', 'data-types', 'get'], '/v1/Interconnections/7/datatypes', 'invalid-interconnection-id'],
  [['personnel', 'get'], '/v1/Personnel/7', 'invalid-personnel-id'],
]

for (const [argv, canonicalPath, errorCode] of ID_COMMANDS) {
  test(`${argv.join(' ')} sends the identifier in canonical integer form`, async () => {
    const body = {id: 7, name: 'Sample'}
    api.enqueue({status: 200, body})

    const result = await run([...argv, '007', '--profile', 'main'])

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stderr, '')
    assert.equal(result.stdout, `${JSON.stringify(body, null, 2)}\n`)
    assert.equal(api.requests.at(-1)!.path, canonicalPath)
  })

  test(`a non-integer identifier on ${argv.join(' ')} exits 2 before any network access`, async () => {
    const requestsBefore = api.requests.length

    const result = await run([...argv, 'seven', '--profile', 'main'])

    assert.equal(result.code, 2)
    assert.equal(result.stdout, '')
    assert.equal(JSON.parse(result.stderr).error.code, errorCode)
    assert.equal(api.requests.length, requestsBefore)
  })

  test(`an identifier beyond the documented int32 range on ${argv.join(' ')} exits 2 before any network access`, async () => {
    const requestsBefore = api.requests.length

    const result = await run([...argv, '2147483648', '--profile', 'main'])

    assert.equal(result.code, 2)
    assert.equal(result.stdout, '')
    assert.equal(JSON.parse(result.stderr).error.code, errorCode)
    assert.equal(api.requests.length, requestsBefore)
  })

  test(`${argv.join(' ')} without an identifier exits 2 before any network access`, async () => {
    const requestsBefore = api.requests.length

    const result = await run([...argv, '--profile', 'main'])

    assert.equal(result.code, 2)
    assert.equal(result.stdout, '')
    assert.notEqual(result.stderr, '')
    assert.equal(api.requests.length, requestsBefore)
  })
}

test('interconnection data-types without get uses the unknown-command failure contract', async () => {
  const result = await run(['interconnection', 'data-types', '9', '--profile', 'main'])

  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.equal(JSON.parse(result.stderr).error.code, 'command-not-found')
})

test('interconnection data-types get help shows the summary, documented path, and permission', async () => {
  const result = await run(['interconnection', 'data-types', 'get', '--help'])

  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /Get the data types associated with one interconnection/)
  assert.match(result.stdout, /\/v1\/Interconnections\/\{id\}\/datatypes/)
  assert.match(result.stdout, /Interconnections:\s+Read/)
})

test('jsonl output prints one valid JSON line per interconnection', async () => {
  const interconnections = [
    {id: 1, name: 'Cloud Service Provider Link'},
    {id: 2, name: 'Partner VPN'},
  ]
  api.enqueue({status: 200, body: interconnections})

  const result = await run(['interconnection', 'list', '--profile', 'main', '--output', 'jsonl'])

  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stderr, '')
  const lines = result.stdout.trimEnd().split('\n')
  assert.deepEqual(lines.map((line) => JSON.parse(line)), interconnections)
})

test('table output renders personnel as aligned columns', async () => {
  const personnel = [
    {id: 1, name: 'Alex Rivera'},
    {id: 2, name: 'Sam Chen'},
  ]
  api.enqueue({status: 200, body: personnel})

  const result = await run(['personnel', 'list', '--profile', 'main', '--output', 'table'])

  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.trimEnd().split('\n')
  assert.equal(lines.length, 1 + personnel.length)
  assert.match(lines[0], /^id\s+name$/)
  assert.match(lines[1], /^1\s+Alex Rivera$/)
  assert.match(lines[2], /^2\s+Sam Chen$/)
})

test('a 403 on an interconnection command names the documented Interconnections permission', async () => {
  api.enqueue({status: 403, body: {title: 'Forbidden', status: 403}})

  const result = await run(['interconnection', 'list', '--profile', 'main'])

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'authentication-failed')
  assert.match(error.message, /Interconnections: Read/)
})

test('a 403 on a personnel command names the documented Personnel permission', async () => {
  api.enqueue({status: 403, body: {title: 'Forbidden', status: 403}})

  const result = await run(['personnel', 'list', '--profile', 'main'])

  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  const error = JSON.parse(result.stderr).error
  assert.equal(error.code, 'authentication-failed')
  assert.match(error.message, /Personnel: Read/)
})

// All three identifier operations document a 404 ProblemDetails response.
for (const [argv] of ID_COMMANDS) {
  test(`a documented 404 on ${argv.join(' ')} exits 7 with the not-found code`, async () => {
    api.enqueue({status: 404, body: {title: 'Not Found', status: 404}})

    const result = await run([...argv, '42', '--profile', 'main'])

    assert.equal(result.code, 7)
    assert.equal(result.stdout, '')
    assert.equal(JSON.parse(result.stderr).error.code, 'not-found')
  })
}

test('help output shows the documented permission for every issue #10 command', async () => {
  for (const [argv, , permission] of MAPPINGS) {
    // Drop the positional identifier so the help invocation stays uniform.
    const commandWords = argv.filter((word) => word !== SAMPLE_ID)
    const help = await run([...commandWords, '--help'])
    assert.equal(help.code, 0, help.stderr)
    // Help text wraps lines, so allow a line break inside the permission.
    const [area, level] = permission.split(': ')
    assert.match(help.stdout, new RegExp(`${area}:\\s+${level}`), commandWords.join(' '))
    // The help must not claim the profile holds the permission.
    assert.match(help.stdout, /does\s+not\s+check/, commandWords.join(' '))
  }
})
