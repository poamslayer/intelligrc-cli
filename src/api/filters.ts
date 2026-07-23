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
  const numeric = Number(raw)
  if (!INTEGER_PATTERN.test(raw) || numeric < INT32_MIN || numeric > INT32_MAX) {
    throw new CliFailure({
      code: 'invalid-evaluation-id',
      message:
        `The value "${raw}" is not a valid evaluation identifier. ` +
        'The documented evaluationId parameter is an integer.',
      exitCode: EXIT.invalidInput,
    })
  }

  return String(numeric)
}

/**
 * Validate one data-type identifier argument as a documented int32
 * integer and return its canonical form, so "007" is sent as "7".
 */
export function parseDataTypeId(raw: string): string {
  const numeric = Number(raw)
  if (!INTEGER_PATTERN.test(raw) || numeric < INT32_MIN || numeric > INT32_MAX) {
    throw new CliFailure({
      code: 'invalid-data-type-id',
      message:
        `The value "${raw}" is not a valid data type identifier. ` +
        'The documented id path parameter is an integer.',
      exitCode: EXIT.invalidInput,
    })
  }

  return String(numeric)
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
