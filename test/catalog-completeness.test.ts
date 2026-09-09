import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {projectRoot, runCli} from './helpers/run-cli.ts'

/**
 * The catalog is the only surface an agent reads before it runs anything, so
 * it must carry the facts an agent needs to act safely: which commands change
 * state, which operations each one can send, and what the exit codes and error
 * codes mean. Every expectation here is written out by hand from the
 * documented behaviour. None of it is derived from src/manifest.ts, so this
 * suite still disagrees with the manifest when the manifest is wrong.
 */

async function catalog(): Promise<Record<string, unknown>> {
  const result = await runCli(['commands'])
  assert.equal(result.code, 0)
  return JSON.parse(result.stdout) as Record<string, unknown>
}

/** The 22 documented write operations the CLI implements. */
const REMOTE_WRITES = [
  'action-plan-project create',
  'action-plan-subtask create',
  'action-plan-task create',
  'assessment-objective update',
  'boundary create',
  'control update',
  'data-type create',
  'data-type delete',
  'data-type update',
  'evaluation create',
  'evidence assessment-objectives set',
  'evidence create',
  'evidence-folder create',
  'facility create',
  'facility data-types set',
  'facility update',
  'interconnection create',
  'interconnection data-types set',
  'interconnection update',
  'personnel create',
  'personnel delete',
  'personnel update',
]

/** The two commands that change local state instead of tenant data. */
const LOCAL_WRITES = ['auth login', 'auth remove']

test('the catalog names every command that changes tenant data', async () => {
  const commands = (await catalog()).commands as Array<{id: string; writes: unknown}>
  const remote = commands.filter((c) => c.writes === 'remote').map((c) => c.id)

  assert.deepEqual(remote.sort(), [...REMOTE_WRITES].sort())
})

test('the catalog separates local writes from tenant writes', async () => {
  const commands = (await catalog()).commands as Array<{id: string; writes: unknown}>
  const local = commands.filter((c) => c.writes === 'local').map((c) => c.id)

  assert.deepEqual(local.sort(), [...LOCAL_WRITES].sort())
})

test('every other command reports that it writes nothing', async () => {
  const commands = (await catalog()).commands as Array<{id: string; writes: unknown}>
  const readOnly = commands.filter((c) => c.writes === null).map((c) => c.id)

  assert.equal(readOnly.length, commands.length - REMOTE_WRITES.length - LOCAL_WRITES.length)
  assert.ok(readOnly.includes('auth status'), 'auth status only reads')
  assert.ok(readOnly.includes('doctor'), 'doctor only reads')
  assert.ok(readOnly.includes('data-type list'), 'a list command only reads')
})

test('the catalog lists every environment variable the source reads', async () => {
  const sourceVariables = new Set<string>()
  for (const entry of readdirSync(join(projectRoot, 'src'), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) {
      continue
    }

    const text = readFileSync(join(entry.parentPath, entry.name), 'utf8')
    for (const match of text.matchAll(/INTELLIGRC_[A-Z_]+/g)) {
      sourceVariables.add(match[0])
    }
  }

  const published = (await catalog()).env as Array<{name: string}>
  assert.deepEqual(
    published.map((entry) => entry.name).sort(),
    [...sourceVariables].sort(),
  )
})

test('the catalog uses version 4', async () => {
  assert.equal((await catalog()).catalogVersion, 4)
})

test('the catalog names the documented operations each API command can send', async () => {
  const commands = (await catalog()).commands as Array<{
    id: string
    kind: string
    operations: Array<{method: string; path: string; selectedBy?: string[]}>
  }>
  const find = (id: string) => commands.find((c) => c.id === id)!

  assert.deepEqual(find('data-type list').operations, [{method: 'GET', path: '/v1/DataTypes'}])
  assert.deepEqual(find('data-type delete').operations, [
    {method: 'DELETE', path: '/v1/DataTypes/{id}'},
  ])
  assert.deepEqual(find('personnel create').operations, [
    {method: 'POST', path: '/v1/Personnel'},
  ])
  // The documented path says Facilities even though the documented
  // permission for the same operation says "Locations: Write".
  assert.deepEqual(find('facility update').operations, [
    {method: 'PUT', path: '/v1/Facilities/{id}'},
  ])
  assert.deepEqual(find('evidence list').operations, [
    {method: 'GET', path: '/v1/Evidence'},
    {
      method: 'GET',
      path: '/v1/Evidence/Evaluation',
      selectedBy: ['evaluation-id', 'framework-id'],
    },
  ])

  // A command that sends no documented operation reports an empty list.
  assert.deepEqual(find('commands').operations, [])
  assert.deepEqual(find('version').operations, [])
  assert.deepEqual(find('auth login').operations, [])

  // Every API command names at least one, and no other command names one.
  for (const command of commands) {
    assert.equal(
      command.operations.length > 0,
      command.kind === 'api',
      `${command.id} operations should be non-empty only for an API command`,
    )
    assert.equal(
      Object.prototype.hasOwnProperty.call(command, 'operation'),
      false,
      `${command.id} must not publish the removed operation field`,
    )
  }
})

test('the catalog publishes the exit codes and their meanings', async () => {
  const published = (await catalog()).exitCodes

  assert.deepEqual(published, [
    {code: 0, name: 'success', meaning: 'The command completed.'},
    {code: 1, name: 'unexpected', meaning: 'An unexpected local failure.'},
    {
      code: 2,
      name: 'invalid-input',
      meaning: 'The command line was rejected before any request was sent.',
    },
    {
      code: 3,
      name: 'local-configuration',
      meaning: 'The profile is missing, incomplete, or unreadable.',
    },
    {
      code: 4,
      name: 'authentication',
      meaning: 'The API rejected the credential or the permission.',
    },
    {code: 5, name: 'network', meaning: 'The request could not reach the API.'},
    {code: 6, name: 'rate-limited', meaning: 'The API reported HTTP 429.'},
    {code: 7, name: 'not-found', meaning: 'The API reported HTTP 404.'},
    {code: 8, name: 'api-failure', meaning: 'The API failed for another reason.'},
  ])
})

/**
 * Every error code the source can emit, collected from the three forms this
 * codebase uses: a literal `code:`, a ternary `code:`, and a code passed as
 * an argument to a shared parser. A fourth form would escape this scan, so
 * this guard is a strong check rather than a proof.
 */
function emittedErrorCodes(): Set<string> {
  const codes = new Set<string>()
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, {recursive: true, withFileTypes: true})) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) {
        continue
      }

      const text = readFileSync(join(entry.parentPath, entry.name), 'utf8')
      for (const m of text.matchAll(/code: '([a-z0-9-]+)'/g)) codes.add(m[1])
      for (const m of text.matchAll(/code: [^'\n]*\? '([a-z0-9-]+)' : '([a-z0-9-]+)'/g)) {
        codes.add(m[1])
        codes.add(m[2])
      }
      for (const m of text.matchAll(/'(invalid-[a-z0-9-]+)'/g)) codes.add(m[1])
    }
  }

  walk(join(projectRoot, 'src'))
  // Not an error: the name of exit code 2 in the published exit-code table.
  codes.delete('invalid-input')
  return codes
}

test('the catalog publishes every error code the CLI can emit', async () => {
  const errors = (await catalog()).errors as {
    codes: Array<{code: string; exitCode: number; meaning: string}>
    families: Array<{prefix: string; exitCode: number; meaning: string}>
    diagnostics: Array<{code: string; meaning: string}>
  }

  const published = new Set([
    ...errors.codes.map((e) => e.code),
    ...errors.diagnostics.map((d) => d.code),
  ])
  const prefixes = errors.families.map((f) => f.prefix)

  const missing = [...emittedErrorCodes()].filter(
    (code) => !published.has(code) && !prefixes.some((p) => code.startsWith(p)),
  )
  assert.deepEqual(missing.sort(), [], 'these emitted codes are absent from the catalog')

  const stale = [...published].filter((code) => !emittedErrorCodes().has(code))
  assert.deepEqual(stale.sort(), [], 'these published codes are no longer emitted')
})

test('each published error code names an exit code and explains itself', async () => {
  const errors = (await catalog()).errors as {
    codes: Array<{code: string; exitCode: number; meaning: string}>
    families: Array<{prefix: string; exitCode: number; meaning: string}>
  }
  const find = (code: string) => errors.codes.find((e) => e.code === code)!

  assert.equal(find('profile-not-found').exitCode, 3)
  assert.equal(find('rate-limited').exitCode, 6)
  assert.equal(find('not-found').exitCode, 7)
  assert.equal(find('create-unconfirmed').exitCode, 5)
  assert.equal(find('delete-declined').exitCode, 2)

  for (const entry of errors.codes) {
    assert.ok(entry.meaning.length > 0, `${entry.code} has no meaning`)
    assert.ok(
      Number.isInteger(entry.exitCode) && entry.exitCode >= 1 && entry.exitCode <= 8,
      `${entry.code} has an out-of-range exit code`,
    )
  }

  assert.deepEqual(
    errors.families.map((f) => f.prefix),
    ['invalid-'],
  )
  assert.equal(errors.families[0].exitCode, 2)
})
