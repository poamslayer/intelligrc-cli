import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {commandSpecs} from '../dist/manifest.js'
import {projectRoot} from './helpers/run-cli.ts'

/**
 * Authoritative contract comparison for issue #11. The archived OpenAPI
 * document is the expected side; the built command manifest is the actual
 * side. Every comparison uses exact string equality — a case-normalized,
 * missing, duplicated, or undocumented mapping fails.
 */

interface SwaggerParameter {
  name: string
  in: string
  required?: boolean
  schema?: {type?: string; format?: string; default?: unknown}
}

interface SwaggerOperation {
  description?: string
  parameters?: SwaggerParameter[]
}

interface ContractParameter {
  name: string
  in: 'query' | 'path'
  required: boolean
  type: string
  format?: string
  default?: unknown
  source: {kind: 'flag' | 'arg'; name: string}
}

interface OperationContract {
  method: 'get'
  path: string
  parameters: ContractParameter[]
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

const swagger = JSON.parse(
  readFileSync(join(projectRoot, 'official-docs', 'swagger', 'v1', 'swagger.json'), 'utf8'),
) as {paths: Record<string, Record<string, SwaggerOperation>>}

/** Every documented operation as an exact "method path" pair. */
function documentedOperations(): Array<{method: string; path: string; operation: SwaggerOperation}> {
  const operations: Array<{method: string; path: string; operation: SwaggerOperation}> = []
  for (const [path, item] of Object.entries(swagger.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (HTTP_METHODS.includes(method)) {
        operations.push({method, path, operation})
      }
    }
  }

  return operations
}

const documentedReads = documentedOperations().filter((entry) => entry.method === 'get')
const documentedWrites = documentedOperations().filter((entry) => entry.method !== 'get')

/**
 * Parse the one documented permission row from an operation description
 * into "<Area>: <Permission>" form. The permission table is the only
 * place the archived contract records permissions. The header row
 * ("| IntelliGRC Area | Permission |") and the required-header rows never
 * match because their second cell is not Read, Write, or Read/Write.
 */
function documentedPermissions(operation: SwaggerOperation): string[] {
  const description = operation.description ?? ''
  const rows = [...description.matchAll(/\|\s*([A-Za-z ]+?)\s*\|\s*(Read\/Write|Read|Write)\s*\|/g)]
  return rows.map((row) => `${row[1]}: ${row[2]}`)
}

const apiSpecs = commandSpecs.filter((spec) => spec.kind === 'api')

function contractOf(spec: (typeof commandSpecs)[number]): OperationContract {
  const contract = (spec as {contract?: OperationContract}).contract
  assert.ok(contract, `API command "${spec.id}" has no contract metadata in the manifest`)
  return contract
}

/** The manifest spec mapped to one documented GET path, by exact string. */
function specForPath(path: string): (typeof commandSpecs)[number] {
  const matches = apiSpecs.filter((spec) => contractOf(spec).path === path)
  assert.equal(matches.length, 1, `Expected exactly one command for documented path ${path}`)
  return matches[0]
}

test('the archived contract documents exactly 50 GET operations', () => {
  assert.equal(documentedReads.length, 50)
})

test('only API commands carry contract metadata', () => {
  for (const spec of commandSpecs) {
    const contract = (spec as {contract?: OperationContract}).contract
    if (spec.kind === 'api') {
      assert.ok(contract, `API command "${spec.id}" has no contract metadata`)
    } else {
      assert.equal(contract, undefined, `Non-API command "${spec.id}" must not carry contract metadata`)
    }
  }
})

test('manifest GET mappings and documented GET operations form a bijection', () => {
  const manifestPairs = apiSpecs.map((spec) => {
    const contract = contractOf(spec)
    assert.equal(contract.method, 'get', `Command "${spec.id}" maps to a non-GET method`)
    return `${contract.method} ${contract.path}`
  })

  // No duplicated mapping: two commands must not claim one operation.
  assert.equal(new Set(manifestPairs).size, manifestPairs.length, 'Duplicate method-and-path mapping')

  // Exact-set equality: nothing missing, nothing undocumented, and a
  // case-normalized path fails the string comparison.
  const documentedPairs = documentedReads.map((entry) => `${entry.method} ${entry.path}`)
  assert.deepEqual([...manifestPairs].sort(), [...documentedPairs].sort())
  assert.equal(manifestPairs.length, 50)

  // No mapping points at a documented write operation. Every manifest
  // method is GET (asserted above), so a write pair can never match.
  const writePairs = new Set(documentedWrites.map((entry) => `${entry.method} ${entry.path}`))
  for (const pair of manifestPairs) {
    assert.ok(!writePairs.has(pair), `Mapping "${pair}" is a documented write operation`)
  }
})

test('every documented parameter appears exactly once with its documented facts', () => {
  for (const {path, operation} of documentedReads) {
    const spec = specForPath(path)
    const contract = contractOf(spec)
    const documented = operation.parameters ?? []

    assert.equal(
      contract.parameters.length,
      documented.length,
      `Command "${spec.id}" maps ${contract.parameters.length} parameters; ` +
        `the contract documents ${documented.length} for ${path}`,
    )

    for (const parameter of documented) {
      const matches = contract.parameters.filter((candidate) => candidate.name === parameter.name)
      assert.equal(
        matches.length,
        1,
        `Command "${spec.id}" must map the documented parameter "${parameter.name}" exactly once`,
      )
      const mapped = matches[0]
      const label = `parameter "${parameter.name}" of ${path}`
      assert.equal(mapped.in, parameter.in, `Wrong location for ${label}`)
      assert.equal(mapped.required, parameter.required ?? false, `Wrong required status for ${label}`)
      assert.equal(mapped.type, parameter.schema?.type, `Wrong type for ${label}`)
      assert.equal(mapped.format, parameter.schema?.format, `Wrong format for ${label}`)
      assert.deepEqual(mapped.default, parameter.schema?.default, `Wrong default for ${label}`)
    }
  }
})

test('every mapped parameter names one existing CLI input with a matching required status', () => {
  for (const spec of apiSpecs) {
    const contract = contractOf(spec)
    const usedSources = new Set<string>()
    for (const parameter of contract.parameters) {
      const pool = parameter.source.kind === 'flag' ? spec.flags : spec.args
      const inputs = pool.filter((input) => input.name === parameter.source.name)
      assert.equal(
        inputs.length,
        1,
        `Command "${spec.id}" maps "${parameter.name}" to a ${parameter.source.kind} ` +
          `named "${parameter.source.name}" that does not exist exactly once`,
      )
      assert.equal(
        inputs[0].required,
        parameter.required,
        `Command "${spec.id}" input "${parameter.source.name}" required status must match ` +
          `the documented parameter "${parameter.name}"`,
      )

      const sourceKey = `${parameter.source.kind}:${parameter.source.name}`
      assert.ok(
        !usedSources.has(sourceKey),
        `Command "${spec.id}" maps two parameters to the same input "${parameter.source.name}"`,
      )
      usedSources.add(sourceKey)
    }
  }
})

test('49 commands report their documented read permission and tenant list reports null', () => {
  let documentedPermissionCount = 0
  for (const {path, operation} of documentedReads) {
    const spec = specForPath(path)
    const permissions = documentedPermissions(operation)

    if (path === '/v1/Tenants') {
      assert.equal(spec.id, 'tenant list')
      assert.equal(permissions.length, 0, 'The tenant-list operation must document no permission')
      assert.equal(spec.permission, null)
      continue
    }

    assert.equal(permissions.length, 1, `Expected one documented permission row for ${path}`)
    assert.equal(
      spec.permission,
      permissions[0],
      `Command "${spec.id}" must report the documented permission for ${path}`,
    )
    documentedPermissionCount += 1
  }

  assert.equal(documentedPermissionCount, 49)
})
