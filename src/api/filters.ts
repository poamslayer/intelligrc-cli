/**
 * Pre-network validation for the documented optional filters. Each parser
 * runs after flag parsing and before profile resolution, so an invalid
 * identifier exits 2 (invalid input) with zero keyring or network access.
 * The returned value goes into the query string under the documented
 * camelCase parameter name.
 */
import {CliFailure, EXIT} from '../errors.js'

/** int32 bounds from the documented "integer, format: int32" schema. */
const INT32_MIN = -2_147_483_648
const INT32_MAX = 2_147_483_647

const INTEGER_PATTERN = /^-?\d+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validate one --evaluation-id value as a documented int32 integer. */
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

  return raw
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
