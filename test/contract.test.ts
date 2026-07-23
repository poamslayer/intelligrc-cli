import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {commandSpecs as builtCommandSpecs} from '../dist/manifest.js'
import type {CommandSpec, OperationContract, RequestBodyFieldContract} from '../src/manifest.ts'
import {projectRoot} from './helpers/run-cli.ts'

/**
 * Authoritative contract comparison for issues #11 and #33. The archived
 * OpenAPI document is the expected side; the built command manifest is the
 * actual side. Every comparison uses exact string equality — a
 * case-normalized, missing, duplicated, or undocumented mapping fails.
 *
 * The manifest import is the built dist/manifest.js (source files cannot
 * be imported directly under type stripping), so this suite compares the
 * build that ships. `npm test` builds before it runs; a direct
 * `node --test` run compares whatever dist/ currently holds.
 */

// The runtime value comes from the untyped built module; the erased
// type-only import above supplies its compile-time shape.
const commandSpecs = builtCommandSpecs as CommandSpec[]

interface SwaggerSchema {
  type?: string
  format?: string
  default?: unknown
  nullable?: boolean
  $ref?: string
  required?: string[]
  properties?: Record<string, SwaggerSchema>
}

interface SwaggerParameter {
  name: string
  in: string
  required?: boolean
  schema?: SwaggerSchema
}

interface SwaggerRequestBody {
  content?: Record<string, {schema?: SwaggerSchema}>
}

interface SwaggerOperation {
  description?: string
  parameters?: SwaggerParameter[]
  requestBody?: SwaggerRequestBody
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

const swagger = JSON.parse(
  readFileSync(join(projectRoot, 'official-docs', 'swagger', 'v1', 'swagger.json'), 'utf8'),
) as {
  paths: Record<string, Record<string, SwaggerOperation>>
  components: {schemas: Record<string, SwaggerSchema>}
}

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

/** The documented operation for one method and path, or undefined. */
function documentedOperationFor(method: string, path: string): SwaggerOperation | undefined {
  return swagger.paths[path]?.[method]
}

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
const readSpecs = apiSpecs.filter((spec) => contractOf(spec).method === 'get')
const writeSpecs = apiSpecs.filter((spec) => contractOf(spec).method !== 'get')

function contractOf(spec: CommandSpec): OperationContract {
  assert.ok(spec.contract, `API command "${spec.id}" has no contract metadata in the manifest`)
  return spec.contract
}

/** The manifest spec mapped to one documented method and path, by exact string. */
function specForOperation(method: string, path: string): CommandSpec {
  const matches = apiSpecs.filter((spec) => {
    const contract = contractOf(spec)
    return contract.method === method && contract.path === path
  })
  assert.equal(matches.length, 1, `Expected exactly one command for documented ${method} ${path}`)
  return matches[0]
}

/**
 * Resolve one write operation's documented request-body schema. The archived
 * document offers the body under three media types that all reference the
 * same data transfer object (DTO); the JSON media type is the one the CLI sends.
 */
function documentedBodySchema(operation: SwaggerOperation): SwaggerSchema | undefined {
  const content = operation.requestBody?.content
  if (!content) {
    return undefined
  }

  const jsonMedia = content['application/json; x-api-version=1.0']
  assert.ok(jsonMedia?.schema?.$ref, 'The documented request body has no JSON schema reference')
  const ref = jsonMedia.schema.$ref
  const name = ref.replace('#/components/schemas/', '')
  const schema = swagger.components.schemas[name]
  assert.ok(schema, `The referenced schema "${name}" is missing from the archived document`)
  return schema
}

test('the archived contract documents exactly 50 GET operations', () => {
  assert.equal(documentedReads.length, 50)
})

test('only API commands carry contract metadata', () => {
  for (const spec of commandSpecs) {
    if (spec.kind === 'api') {
      contractOf(spec)
    } else {
      assert.equal(
        spec.contract,
        undefined,
        `Non-API command "${spec.id}" must not carry contract metadata`,
      )
    }
  }
})

test('manifest GET mappings and documented GET operations form a bijection', () => {
  const manifestPairs = readSpecs.map((spec) => {
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
})

test('every mapped write operation is a documented write and the Data Types slice is complete', () => {
  const documentedWritePairs = new Set(documentedWrites.map((entry) => `${entry.method} ${entry.path}`))

  const manifestWritePairs = writeSpecs.map((spec) => {
    const contract = contractOf(spec)
    const pair = `${contract.method} ${contract.path}`
    assert.ok(documentedWritePairs.has(pair), `Mapping "${pair}" is not a documented write operation`)
    return pair
  })

  // No duplicated write mapping.
  assert.equal(
    new Set(manifestWritePairs).size,
    manifestWritePairs.length,
    'Duplicate write method-and-path mapping',
  )

  // The first slice ships exactly the three Data Types writes and no more.
  assert.deepEqual([...manifestWritePairs].sort(), [
    'delete /v1/DataTypes/{id}',
    'post /v1/DataTypes',
    'put /v1/DataTypes/{id}',
  ])
})

test('every documented parameter of a mapped operation appears exactly once with its documented facts', () => {
  for (const spec of apiSpecs) {
    const contract = contractOf(spec)
    const operation = documentedOperationFor(contract.method, contract.path)
    assert.ok(operation, `Command "${spec.id}" maps to undocumented ${contract.method} ${contract.path}`)
    const documented = operation.parameters ?? []

    assert.equal(
      contract.parameters.length,
      documented.length,
      `Command "${spec.id}" maps ${contract.parameters.length} parameters; ` +
        `the contract documents ${documented.length} for ${contract.path}`,
    )

    for (const parameter of documented) {
      const matches = contract.parameters.filter((candidate) => candidate.name === parameter.name)
      assert.equal(
        matches.length,
        1,
        `Command "${spec.id}" must map the documented parameter "${parameter.name}" exactly once`,
      )
      const mapped = matches[0]
      const label = `parameter "${parameter.name}" of ${contract.path}`
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

test('every write command body field matches the documented DTO and names one existing flag', () => {
  for (const spec of writeSpecs) {
    const contract = contractOf(spec)
    const operation = documentedOperationFor(contract.method, contract.path)!
    const schema = documentedBodySchema(operation)

    if (contract.method === 'delete') {
      assert.equal(schema, undefined, `Delete command "${spec.id}" must document no request body`)
      assert.equal(contract.requestBody, undefined, `Delete command "${spec.id}" must map no body`)
      continue
    }

    assert.ok(schema?.properties, `Command "${spec.id}" maps a write with no documented body schema`)
    assert.ok(contract.requestBody, `Command "${spec.id}" maps a write with no body-field contract`)

    const documentedNames = Object.keys(schema.properties).sort()
    const mappedNames = contract.requestBody.map((field) => field.name).sort()
    assert.deepEqual(mappedNames, documentedNames, `Command "${spec.id}" body fields must match the DTO`)

    const requiredSet = new Set(schema.required ?? [])
    for (const [name, property] of Object.entries(schema.properties)) {
      const fields = contract.requestBody.filter((field) => field.name === name)
      assert.equal(fields.length, 1, `Command "${spec.id}" must map body field "${name}" exactly once`)
      const field: RequestBodyFieldContract = fields[0]
      const label = `body field "${name}" of ${contract.path}`
      assert.equal(field.type, property.type, `Wrong type for ${label}`)
      assert.equal(field.format, property.format, `Wrong format for ${label}`)
      assert.equal(field.required, requiredSet.has(name), `Wrong required status for ${label}`)
      assert.equal(field.nullable, property.nullable, `Wrong nullable status for ${label}`)

      const flagInputs = spec.flags.filter((flag) => flag.name === field.source.name)
      assert.equal(
        flagInputs.length,
        1,
        `Command "${spec.id}" body field "${name}" names a flag "${field.source.name}" that does not exist`,
      )
      assert.equal(
        flagInputs[0].required,
        field.required,
        `Command "${spec.id}" flag "${field.source.name}" required status must match body field "${name}"`,
      )
    }
  }
})

test('every mapped API command reports its documented permission, and tenant list reports null', () => {
  for (const spec of apiSpecs) {
    const contract = contractOf(spec)
    const operation = documentedOperationFor(contract.method, contract.path)!
    const permissions = documentedPermissions(operation)

    if (contract.path === '/v1/Tenants') {
      assert.equal(spec.id, 'tenant list')
      assert.equal(permissions.length, 0, 'The tenant-list operation must document no permission')
      assert.equal(spec.permission, null)
      continue
    }

    assert.equal(permissions.length, 1, `Expected one documented permission row for ${contract.method} ${contract.path}`)
    assert.equal(
      spec.permission,
      permissions[0],
      `Command "${spec.id}" must report the documented permission for ${contract.path}`,
    )
  }
})
