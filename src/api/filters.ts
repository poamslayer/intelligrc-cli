/**
 * Pre-network validation for the documented optional filters. Each parser
 * runs after flag parsing and before profile resolution, so an invalid
 * identifier exits 2 (invalid input) with zero keyring or network access.
 * The returned value goes into the query string under the documented
 * camelCase parameter name.
 */
import {CliFailure, EXIT} from '../errors.js'
import {type QueryPairs} from './client.js'

/** int32 bounds from the documented "integer, format: int32" schema. */
const INT32_MIN = -2_147_483_648
const INT32_MAX = 2_147_483_647

const INTEGER_PATTERN = /^-?\d+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when the value is a well-formed integer inside the documented int32 range. */
function isInt32(raw: string): boolean {
  const numeric = Number(raw)
  return INTEGER_PATTERN.test(raw) && numeric >= INT32_MIN && numeric <= INT32_MAX
}

/**
 * Build the query pairs from the shared --evaluation-id and --framework-id
 * flags. An omitted flag contributes nothing, so it never appears in the
 * query string.
 */
export function filterQueryFromFlags(flags: Record<string, unknown>): QueryPairs {
  return buildFilterQuery(
    flags['evaluation-id'] as string | undefined,
    flags['framework-id'] as string | undefined,
  )
}

export function buildFilterQuery(
  evaluationId: string | undefined,
  frameworkId: string | undefined,
): QueryPairs {
  const query: QueryPairs = []
  if (evaluationId !== undefined) {
    query.push(['evaluationId', parseEvaluationId(evaluationId)])
  }

  if (frameworkId !== undefined) {
    query.push(['frameworkId', parseFrameworkId(frameworkId)])
  }

  return query
}

/**
 * Build the query pairs for the action-plan listing commands from the
 * shared --evaluation-id flag and the explicit Boolean inclusion flags.
 * The pairs follow the documented parameter order: evaluationId,
 * includeTasks, includeSubTasks. An omitted flag contributes nothing, so
 * the server applies its documented Boolean default. The Boolean values
 * arrive already constrained to "true" or "false" by the flag's allowed
 * values, so they pass through under the documented camelCase names.
 */
export function actionPlanQueryFromFlags(flags: Record<string, unknown>): QueryPairs {
  const query: QueryPairs = []
  const evaluationId = flags['evaluation-id'] as string | undefined
  if (evaluationId !== undefined) {
    query.push(['evaluationId', parseEvaluationId(evaluationId)])
  }

  const includeTasks = flags['include-tasks'] as string | undefined
  if (includeTasks !== undefined) {
    query.push(['includeTasks', includeTasks])
  }

  const includeSubTasks = flags['include-subtasks'] as string | undefined
  if (includeSubTasks !== undefined) {
    query.push(['includeSubTasks', includeSubTasks])
  }

  return query
}

/**
 * Validate one --evaluation-id value as a documented int32 integer and
 * return its canonical form, so "007" is sent as "7".
 */
export function parseEvaluationId(raw: string): string {
  return parseInt32Id(raw, 'invalid-evaluation-id', 'evaluation', 'evaluationId parameter')
}

/**
 * Validate one data-type identifier argument as a documented int32
 * integer and return its canonical form, so "007" is sent as "7".
 */
export function parseDataTypeId(raw: string): string {
  return parseInt32Id(raw, 'invalid-data-type-id', 'data type', 'id path parameter')
}

/**
 * Validate one facility identifier argument as a documented int32
 * integer and return its canonical form, so "007" is sent as "7".
 */
export function parseFacilityId(raw: string): string {
  return parseInt32Id(raw, 'invalid-facility-id', 'facility', 'id path parameter')
}

/**
 * Validate one interconnection identifier argument as a documented int32
 * integer and return its canonical form, so "007" is sent as "7".
 */
export function parseInterconnectionId(raw: string): string {
  return parseInt32Id(raw, 'invalid-interconnection-id', 'interconnection', 'id path parameter')
}

/**
 * Validate one personnel identifier argument as a documented int32
 * integer and return its canonical form, so "007" is sent as "7".
 */
export function parsePersonnelId(raw: string): string {
  return parseInt32Id(raw, 'invalid-personnel-id', 'personnel', 'id path parameter')
}

/**
 * The validated body of a data-type create or update request. The two
 * documented data transfer objects (DTOs) share this shape. The three level
 * identifiers are JSON numbers, so they serialize as documented int32
 * integers rather than strings. `description` is present only when the user
 * supplied it, so an omitted description leaves the field out and the server
 * applies its documented default.
 */
export interface DataTypeBody {
  name: string
  description?: string
  confidentialityId: number
  integrityId: number
  availabilityId: number
}

/**
 * Build the validated data-type body from the write command's flags. Runs
 * before profile resolution, so a non-integer level identifier exits 2 with
 * a stable code and zero keyring or network access. The CLI does not check
 * the level identifiers against the lookup catalogs — the IntelliGRC API is
 * the authority that accepts or rejects them.
 */
export function buildDataTypeBody(flags: Record<string, unknown>): DataTypeBody {
  const body: DataTypeBody = {
    name: flags.name as string,
    confidentialityId: parseLevelId(flags['confidentiality-id'] as string, 'confidentiality-id'),
    integrityId: parseLevelId(flags['integrity-id'] as string, 'integrity-id'),
    availabilityId: parseLevelId(flags['availability-id'] as string, 'availability-id'),
  }

  const description = flags.description as string | undefined
  if (description !== undefined) {
    body.description = description
  }

  return body
}

/**
 * Validate one data-type level flag as a documented int32 integer and return
 * its numeric value. The flag name appears in the stable error code and the
 * message so the user learns exactly which level was wrong.
 */
function parseLevelId(raw: string, flagName: string): number {
  if (!isInt32(raw)) {
    throw new CliFailure({
      code: `invalid-${flagName}`,
      message:
        `The value "${raw}" for --${flagName} is not a valid level ` +
        'identifier. The documented field is an integer.',
      exitCode: EXIT.invalidInput,
    })
  }

  return Number(raw)
}

/**
 * Shared int32 validation, the integer counterpart of parseUuid. Every
 * documented integer identifier fails the same way: exit 2 with a stable
 * code, before any keyring or network access.
 */
function parseInt32Id(raw: string, code: string, label: string, documentedName: string): string {
  if (!isInt32(raw)) {
    throw new CliFailure({
      code,
      message:
        `The value "${raw}" is not a valid ${label} identifier. ` +
        `The documented ${documentedName} is an integer.`,
      exitCode: EXIT.invalidInput,
    })
  }

  return String(Number(raw))
}

/** Validate one --framework-id value as a universally unique identifier. */
export function parseFrameworkId(raw: string): string {
  return parseUuid(raw, 'invalid-framework-id', 'framework', 'frameworkId parameter')
}

/** Validate one --assessment-objective-id value as a universally unique identifier. */
export function parseAssessmentObjectiveId(raw: string): string {
  return parseUuid(
    raw,
    'invalid-assessment-objective-id',
    'assessment objective',
    'assessmentObjectiveId parameter',
  )
}

/** Validate one --parent-id value as a universally unique identifier. */
export function parseParentId(raw: string): string {
  return parseUuid(raw, 'invalid-parent-id', 'parent folder', 'parentId parameter')
}

/** Validate one --icl-version-id value as a universally unique identifier. */
export function parseIclVersionId(raw: string): string {
  return parseUuid(
    raw,
    'invalid-icl-version-id',
    'Intelligent Control Library version',
    'iclVersionId path parameter',
  )
}

/**
 * Shared UUID validation. Every documented UUID input fails the same way:
 * exit 2 with a stable code, before any keyring or network access.
 */
function parseUuid(raw: string, code: string, label: string, documentedName: string): string {
  if (!UUID_PATTERN.test(raw)) {
    throw new CliFailure({
      code,
      message:
        `The value "${raw}" is not a valid ${label} identifier. ` +
        `The documented ${documentedName} is a universally unique ` +
        'identifier (UUID), for example 3fa85f64-5717-4562-b3fc-2c963f66afa6.',
      exitCode: EXIT.invalidInput,
    })
  }

  return raw
}
