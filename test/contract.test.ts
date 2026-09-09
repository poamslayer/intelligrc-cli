import assert from 'node:assert/strict'
import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {buildCatalog, commandSpecs as builtCommandSpecs} from '../dist/manifest.js'
import type {
  CommandSpec,
  OperationContract,
  RequestBodyFieldContract,
  RequestBodyItemFieldContract,
} from '../src/manifest.ts'
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
  /** Present on an array schema: the documented schema of one array item. */
  items?: SwaggerSchema
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

// The vendor's proprietary OpenAPI document is optional because it is not
// distributed with this repository.
const swaggerPath =
  process.env.INTELLIGRC_OPENAPI_PATH ||
  join(projectRoot, 'official-docs', 'swagger', 'v1', 'swagger.json')
const swaggerAvailable = existsSync(swaggerPath)
const skipMessage =
  `OpenAPI document not found at ${swaggerPath}; ` +
  'set INTELLIGRC_OPENAPI_PATH to run the contract suite'
const swagger = (swaggerAvailable
  ? JSON.parse(readFileSync(swaggerPath, 'utf8'))
  : {paths: {}, components: {schemas: {}}}) as {
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

/** Every operation contract an API command can send, default first. */
function contractsOf(spec: CommandSpec): OperationContract[] {
  return [contractOf(spec), ...(spec.variants ?? []).map((variant) => variant.contract)]
}

/** The manifest spec mapped to one documented method and path, by exact string. */
function specForOperation(method: string, path: string): CommandSpec {
  const matches = apiSpecs.filter((spec) =>
    contractsOf(spec).some((contract) => contract.method === method && contract.path === path),
  )
  assert.equal(matches.length, 1, `Expected exactly one command for documented ${method} ${path}`)
  return matches[0]
}

/**
 * Resolve one write operation's documented request-body schema. The archived
 * document offers the body under three media types that all reference the
 * same data transfer object (DTO); the JSON media type is the one the CLI sends.
 */
/**
 * Resolve a schema that may be a $ref into the referenced schema. A schema
 * without a $ref is returned unchanged, so a scalar array item schema
 * (integer/int32, string/uuid) passes through while an object array item
 * ($ref) is followed to its nested DTO.
 */
function resolveSchemaRef(schema: SwaggerSchema): SwaggerSchema {
  if (!schema.$ref) {
    return schema
  }

  const name = schema.$ref.replace('#/components/schemas/', '')
  const resolved = swagger.components.schemas[name]
  assert.ok(resolved, `The referenced schema "${name}" is missing from the archived document`)
  return resolved
}

/**
 * Compare the mapped sub-field contract of an object array item against the
 * documented item DTO. This mirrors the top-level body-field comparison
 * (matching names, and exact type, format, required, and nullable), without
 * the flag check, because one flag supplies the whole array.
 */
function assertItemFieldsMatch(
  mapped: RequestBodyItemFieldContract[],
  itemSchema: SwaggerSchema,
  label: string,
): void {
  assert.ok(itemSchema.properties, `Object item for ${label} has no documented properties`)
  const documentedNames = Object.keys(itemSchema.properties).sort()
  const mappedNames = mapped.map((field) => field.name).sort()
  assert.deepEqual(mappedNames, documentedNames, `Object-item sub-fields for ${label} must match the DTO`)

  const requiredSet = new Set(itemSchema.required ?? [])
  for (const [name, property] of Object.entries(itemSchema.properties)) {
    const fields = mapped.filter((field) => field.name === name)
    assert.equal(fields.length, 1, `${label} must map item sub-field "${name}" exactly once`)
    const field = fields[0]
    const subLabel = `sub-field "${name}" of the item for ${label}`
    assert.equal(field.type, property.type, `Wrong type for ${subLabel}`)
    assert.equal(field.format, property.format, `Wrong format for ${subLabel}`)
    assert.equal(field.required, requiredSet.has(name), `Wrong required status for ${subLabel}`)
    assert.equal(field.nullable, property.nullable, `Wrong nullable status for ${subLabel}`)
  }
}

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

test('the archived contract documents exactly 50 GET operations', {skip: swaggerAvailable ? false : skipMessage}, () => {
  assert.equal(documentedReads.length, 50)
})

test('only API commands carry contract metadata', {skip: swaggerAvailable ? false : skipMessage}, () => {
  for (const spec of commandSpecs) {
    if (spec.kind === 'api') {
      contractOf(spec)
    } else {
      assert.equal(
        spec.contract,
        undefined,
        `Non-API command "${spec.id}" must not carry contract metadata`,
      )
      assert.equal(
        spec.variants,
        undefined,
        `Non-API command "${spec.id}" must not carry variant metadata`,
      )
    }
  }
})

test('manifest GET mappings and documented GET operations form a bijection', {skip: swaggerAvailable ? false : skipMessage}, () => {
  const manifestPairs = readSpecs.flatMap((spec) =>
    contractsOf(spec).map((contract) => {
      assert.equal(
        contract.method,
        'get',
        `Command "${spec.id}" contract ${contract.path} maps to a non-GET method`,
      )
      return `${contract.method} ${contract.path}`
    }),
  )

  // No duplicated mapping: two contracts must not claim one operation.
  assert.equal(new Set(manifestPairs).size, manifestPairs.length, 'Duplicate method-and-path mapping')

  // Exact-set equality: nothing missing, nothing undocumented, and a
  // case-normalized path fails the string comparison.
  const documentedPairs = documentedReads.map((entry) => `${entry.method} ${entry.path}`)
  assert.deepEqual([...manifestPairs].sort(), [...documentedPairs].sort())
  assert.equal(manifestPairs.length, 50)
})

test('every mapped write operation is a documented write and the mapped write set is complete', {skip: swaggerAvailable ? false : skipMessage}, () => {
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

  // The mapped writes are the three Data Types writes (#33), the two
  // data-type association writes (#42), the evidence assessment-objectives
  // association write (#46), the assessment-objective update (#47), the two
  // interconnection writes (#48), the evaluation create (#43), the boundary
  // create (#44), the three action-plan creates (#45), the control
  // update (#41), the two facility writes (#39), the three personnel writes
  // (#38), and the two evidence creates (#40), and no more.
  assert.deepEqual([...manifestWritePairs].sort(), [
    'delete /v1/DataTypes/{id}',
    'delete /v1/Personnel/{id}',
    'post /v1/ActionPlanProjects',
    'post /v1/ActionPlanSubTasks',
    'post /v1/ActionPlanTasks',
    'post /v1/Boundaries',
    'post /v1/DataTypes',
    'post /v1/Evaluations',
    'post /v1/Evidence',
    'post /v1/Evidence/Folders',
    'post /v1/Facilities',
    'post /v1/Interconnections',
    'post /v1/Personnel',
    'put /v1/AssessmentObjectives/{id}',
    'put /v1/Controls/{controlId}',
    'put /v1/DataTypes/{id}',
    'put /v1/Evidence/{id}/AssessmentObjectives',
    'put /v1/Facilities/{id}',
    'put /v1/Facilities/{id}/datatypes',
    'put /v1/Interconnections/{id}',
    'put /v1/Interconnections/{id}/datatypes',
    'put /v1/Personnel/{id}',
  ])
})

test('every documented parameter of a mapped operation appears exactly once with its documented facts', {skip: swaggerAvailable ? false : skipMessage}, () => {
  for (const spec of apiSpecs) {
    for (const contract of contractsOf(spec)) {
      const operation = documentedOperationFor(contract.method, contract.path)
      assert.ok(
        operation,
        `Command "${spec.id}" contract ${contract.path} maps to undocumented ` +
          `${contract.method} ${contract.path}`,
      )
      const documented = operation.parameters ?? []

      assert.equal(
        contract.parameters.length,
        documented.length,
        `Command "${spec.id}" contract ${contract.path} maps ${contract.parameters.length} ` +
          `parameters; the contract documents ${documented.length}`,
      )

      for (const parameter of documented) {
        const matches = contract.parameters.filter((candidate) => candidate.name === parameter.name)
        assert.equal(
          matches.length,
          1,
          `Command "${spec.id}" contract ${contract.path} must map the documented parameter ` +
            `"${parameter.name}" exactly once`,
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
  }
})

test('every mapped parameter names one existing CLI input with a matching required status', {skip: swaggerAvailable ? false : skipMessage}, () => {
  for (const spec of apiSpecs) {
    for (const contract of contractsOf(spec)) {
      const usedSources = new Set<string>()
      for (const parameter of contract.parameters) {
        const pool = parameter.source.kind === 'flag' ? spec.flags : spec.args
        const inputs = pool.filter((input) => input.name === parameter.source.name)
        assert.equal(
          inputs.length,
          1,
          `Command "${spec.id}" contract ${contract.path} maps "${parameter.name}" to a ` +
            `${parameter.source.kind} named "${parameter.source.name}" that does not exist exactly once`,
        )
        assert.equal(
          inputs[0].required,
          parameter.required,
          `Command "${spec.id}" contract ${contract.path} input "${parameter.source.name}" ` +
            `required status must match the documented parameter "${parameter.name}"`,
        )

        const sourceKey = `${parameter.source.kind}:${parameter.source.name}`
        assert.ok(
          !usedSources.has(sourceKey),
          `Command "${spec.id}" contract ${contract.path} maps two parameters to the same ` +
            `input "${parameter.source.name}"`,
        )
        usedSources.add(sourceKey)
      }
    }
  }
})

test('every variant keeps the default method and names selecting flags exactly once', {skip: swaggerAvailable ? false : skipMessage}, () => {
  for (const spec of apiSpecs) {
    const defaultContract = contractOf(spec)
    for (const variant of spec.variants ?? []) {
      assert.equal(
        variant.contract.method,
        defaultContract.method,
        `Command "${spec.id}" variant ${variant.contract.path} must use the default method`,
      )
      for (const name of variant.selectedBy) {
        assert.equal(
          spec.flags.filter((flag) => flag.name === name).length,
          1,
          `Command "${spec.id}" variant ${variant.contract.path} must name selecting flag ` +
            `"${name}" exactly once`,
        )
      }
    }
  }
})

test('every write command body field matches the documented DTO and names one existing flag', {skip: swaggerAvailable ? false : skipMessage}, () => {
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

      // An array field records its documented item schema; a scalar field
      // records none. A scalar item (integer/int32, string/uuid) records its
      // type and format; an object item (a $ref to a nested DTO) records type
      // "object" and the contract of each of its sub-fields. Both are verified
      // by exact equality, exactly like the scalar field's own type and format.
      if (property.type === 'array') {
        assert.ok(field.items, `Array ${label} must record its item schema`)
        assert.ok(property.items, `Documented array ${label} has no item schema`)
        const itemSchema = resolveSchemaRef(property.items)
        assert.equal(field.items.type, itemSchema.type, `Wrong item type for ${label}`)
        assert.equal(field.items.format, itemSchema.format, `Wrong item format for ${label}`)

        if (itemSchema.type === 'object') {
          assert.ok(field.items.fields, `Object-item ${label} must record its sub-field contract`)
          assertItemFieldsMatch(field.items.fields, itemSchema, label)
        } else {
          assert.equal(field.items.fields, undefined, `Scalar-item ${label} must not record sub-fields`)
        }
      } else {
        assert.equal(field.items, undefined, `Scalar ${label} must not record an item schema`)
      }

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

test('every mapped API command reports its documented permission, and tenant list reports null', {skip: swaggerAvailable ? false : skipMessage}, () => {
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

    // Most operations document exactly one permission. The evidence
    // assessment-objectives write documents two acceptable permissions
    // ("At least one of the following": Evidence Write or Evidence Read), so
    // the command must report one of the documented permissions rather than a
    // single fixed row.
    assert.ok(
      permissions.length >= 1,
      `Expected at least one documented permission row for ${contract.method} ${contract.path}`,
    )
    assert.ok(
      spec.permission !== null && permissions.includes(spec.permission),
      `Command "${spec.id}" must report a documented permission for ${contract.path}; ` +
        `reported "${spec.permission}", documented ${JSON.stringify(permissions)}`,
    )
  }
})

test('every catalog operation is documented, and only API commands publish operations', {skip: swaggerAvailable ? false : skipMessage}, () => {
  const documented = new Set(documentedOperations().map(({method, path}) => `${method.toUpperCase()} ${path}`))

  for (const command of buildCatalog().commands) {
    if (command.kind !== 'api') {
      assert.deepEqual(command.operations, [], `${command.id} must not publish operations`)
      continue
    }

    assert.ok(command.operations.length > 0, `${command.id} must publish a documented operation`)
    for (const operation of command.operations) {
      const named = `${operation.method} ${operation.path}`
      assert.ok(documented.has(named), `${command.id} publishes undocumented operation ${named}`)
    }
  }
})

test('a catalog write target agrees with the documented method', {skip: swaggerAvailable ? false : skipMessage}, () => {
  for (const command of buildCatalog().commands) {
    if (command.kind !== 'api') {
      continue
    }

    const defaultOperation = command.operations[0]
    assert.ok(defaultOperation, `${command.id} must publish its default operation first`)
    assert.equal(
      command.writes,
      defaultOperation.method === 'GET' ? null : 'remote',
      `${command.id} reports the wrong write target for ${defaultOperation.method}`,
    )
  }
})
