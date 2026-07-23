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

/** Validate one --framework-id value as a universally unique identifier. */
export function parseFrameworkId(raw: string): string {
  if (!UUID_PATTERN.test(raw)) {
    throw new CliFailure({
      code: 'invalid-framework-id',
      message:
        `The value "${raw}" is not a valid framework identifier. ` +
        'The documented frameworkId parameter is a universally unique ' +
        'identifier (UUID), for example 3fa85f64-5717-4562-b3fc-2c963f66afa6.',
      exitCode: EXIT.invalidInput,
    })
  }

  return raw
}
