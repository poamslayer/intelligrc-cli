/**
 * Pre-network input validation for the documented API commands. Two kinds of
 * builder live here: query-filter builders that turn optional flags into the
 * documented query parameters, and request-body builders that turn write-command
 * flags into the documented request body. Every parser runs after flag parsing
 * and before profile resolution, so an invalid identifier, number, UUID, or
 * date exits 2 (invalid input) with zero keyring or network access. A query
 * value goes into the query string under the documented camelCase parameter
 * name; a body value goes into the JSON body under the documented field name.
 */
import {CliFailure, EXIT} from '../errors.js'
import {type QueryPairs} from './client.js'

/** int32 bounds from the documented "integer, format: int32" schema. */
const INT32_MIN = -2_147_483_648
const INT32_MAX = 2_147_483_647

const INTEGER_PATTERN = /^-?\d+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A finite decimal number for a documented "number, format: double" field. */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

/** A calendar date in the documented YYYY-MM-DD form. */
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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
 * Build the query pairs for the evidence assessment-objectives set command
 * from the optional --preserve-existing flag. An omitted flag contributes
 * nothing, so the server applies its documented default (false, which
 * replaces the existing mappings). The value arrives already constrained to
 * "true" or "false" by the flag's allowed values, so it passes through under
 * the documented camelCase name.
 */
export function evidenceAssessmentObjectivesQueryFromFlags(
  flags: Record<string, unknown>,
): QueryPairs {
  const query: QueryPairs = []
  const preserveExisting = flags['preserve-existing'] as string | undefined
  if (preserveExisting !== undefined) {
    query.push(['preserveExisting', preserveExisting])
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
    confidentialityId: parseIntegerFlag(
      flags['confidentiality-id'] as string,
      'confidentiality-id',
      'level identifier',
    ),
    integrityId: parseIntegerFlag(flags['integrity-id'] as string, 'integrity-id', 'level identifier'),
    availabilityId: parseIntegerFlag(
      flags['availability-id'] as string,
      'availability-id',
      'level identifier',
    ),
  }

  const description = flags.description as string | undefined
  if (description !== undefined) {
    body.description = description
  }

  return body
}

/**
 * The validated body of a data-type association request. The documented
 * FacilityDataTypesUpdateDTO and InterconnectionDataTypesUpdateDTO share this
 * shape: one array of int32 identifiers named `dataTypeIds`. The array is
 * always present, so an omitted flag serializes as `{"dataTypeIds":[]}` and
 * the server clears every association.
 */
export interface DataTypeIdsBody {
  dataTypeIds: number[]
}

/**
 * Build the validated data-type association body from the repeatable
 * --data-type-id flag. Runs before profile resolution, so a non-integer
 * element exits 2 with a stable code and zero keyring or network access. An
 * omitted flag (oclif passes undefined) and an empty list both produce an
 * empty array, which serializes as the documented empty `dataTypeIds` array.
 */
export function buildDataTypeIdsBody(flags: Record<string, unknown>): DataTypeIdsBody {
  const values = (flags['data-type-id'] as string[] | undefined) ?? []
  return {dataTypeIds: parseDataTypeIdList(values)}
}

/**
 * Validate the repeatable --data-type-id flag as a list of documented int32
 * integers, one element at a time, and return the canonical numeric values in
 * the order supplied. A JSON number serializes as the documented int32
 * integer rather than a string. The first non-integer element throws with the
 * shared invalid-data-type-id code so the user learns which value was wrong.
 */
export function parseDataTypeIdList(values: string[]): number[] {
  return parseInt32List(values, 'invalid-data-type-id', 'data-type-id', 'data type', 'dataTypeIds')
}

/**
 * Validate a repeatable integer flag as a list of documented int32 integers,
 * one element at a time, and return the canonical numeric values in the order
 * supplied. This is the array counterpart of parseIntegerFlag, shared by every
 * request-body flag whose documented field is an array of int32 identifiers. A
 * JSON number serializes as the documented int32 integer rather than a string.
 * The first non-integer element throws exit 2 with the caller's stable `code`;
 * `flagName` names the flag in the message, `itemLabel` names the kind of
 * identifier, and `arrayField` names the documented array field the values
 * populate.
 */
function parseInt32List(
  values: string[],
  code: string,
  flagName: string,
  itemLabel: string,
  arrayField: string,
): number[] {
  return values.map((value) => {
    if (!isInt32(value)) {
      throw new CliFailure({
        code,
        message:
          `The value "${value}" for --${flagName} is not a valid ${itemLabel} ` +
          `identifier. Each documented ${arrayField} item is an integer.`,
        exitCode: EXIT.invalidInput,
      })
    }

    return Number(value)
  })
}

/**
 * The validated body of an evidence assessment-objectives association
 * request. The documented EvidenceAssessmentObjectivesUpdateDTO has one
 * required array field named `assessmentObjectiveIds`. Each element is a
 * documented UUID, so the array holds strings rather than the numbers used
 * by the data-type association body.
 */
export interface AssessmentObjectiveIdsBody {
  assessmentObjectiveIds: string[]
}

/**
 * Build the validated assessment-objective association body from the
 * repeatable --assessment-objective-id flag. Runs before profile resolution,
 * so a malformed UUID exits 2 with a stable code and zero keyring or network
 * access. The flag is required, so oclif guarantees at least one value; the
 * `?? []` guard keeps the builder total for direct callers.
 */
export function buildAssessmentObjectiveIdsBody(
  flags: Record<string, unknown>,
): AssessmentObjectiveIdsBody {
  const values = (flags['assessment-objective-id'] as string[] | undefined) ?? []
  return {assessmentObjectiveIds: parseAssessmentObjectiveIdList(values)}
}

/**
 * Validate the repeatable --assessment-objective-id flag as a list of
 * documented UUIDs, one element at a time, and return the values in the order
 * supplied. The first malformed element throws with the shared
 * invalid-assessment-objective-id code so the user learns which value was
 * wrong.
 */
export function parseAssessmentObjectiveIdList(values: string[]): string[] {
  return parseUuidList(
    values,
    'invalid-assessment-objective-id',
    'assessment-objective-id',
    'assessment objective',
    'assessmentObjectiveIds',
  )
}

/**
 * Validate a repeatable UUID flag as a list of documented UUIDs, one element at
 * a time, and return the values in the order supplied. This is the array
 * counterpart of parseUuid, shared by every request-body flag whose documented
 * field is an array of UUID identifiers. The first malformed element throws
 * exit 2 with the caller's stable `code`; `flagName` names the flag in the
 * message, `itemLabel` names the kind of identifier, and `arrayField` names the
 * documented array field the values populate.
 */
function parseUuidList(
  values: string[],
  code: string,
  flagName: string,
  itemLabel: string,
  arrayField: string,
): string[] {
  return values.map((value) => {
    if (!UUID_PATTERN.test(value)) {
      throw new CliFailure({
        code,
        message:
          `The value "${value}" for --${flagName} is not a valid ${itemLabel} ` +
          `identifier. Each documented ${arrayField} item is a universally ` +
          'unique identifier (UUID), for example ' +
          '3fa85f64-5717-4562-b3fc-2c963f66afa6.',
        exitCode: EXIT.invalidInput,
      })
    }

    return value
  })
}

/**
 * The validated body of an assessment-objective update request. The
 * documented AssessmentObjectiveUpdateDTO marks every field optional and
 * nullable, so this is a partial update: a field is present only when the
 * user supplied its flag, and an omitted flag leaves the field out of the
 * body. The two identifier fields are JSON numbers, so they serialize as the
 * documented int32 integers; the four text fields pass through as strings.
 * `validationMethods` is a single documented string, not a list.
 */
export interface AssessmentObjectiveUpdateBody {
  evaluationId?: number
  statusId?: number
  implementationDetail?: string
  findingDetail?: string
  recommendationDetail?: string
  validationMethods?: string
}

/**
 * Build the validated assessment-objective update body from the update
 * command's flags. Runs before profile resolution, so a non-integer
 * evaluation or status identifier exits 2 with a stable code and zero keyring
 * or network access. Each field is included only when the user supplied its
 * flag, matching the documented partial-update contract.
 */
export function buildAssessmentObjectiveUpdateBody(
  flags: Record<string, unknown>,
): AssessmentObjectiveUpdateBody {
  const body: AssessmentObjectiveUpdateBody = {}

  const evaluationId = flags['evaluation-id'] as string | undefined
  if (evaluationId !== undefined) {
    body.evaluationId = parseIntegerFlag(evaluationId, 'evaluation-id', 'identifier')
  }

  const statusId = flags['status-id'] as string | undefined
  if (statusId !== undefined) {
    body.statusId = parseIntegerFlag(statusId, 'status-id', 'identifier')
  }

  const implementationDetail = flags['implementation-detail'] as string | undefined
  if (implementationDetail !== undefined) {
    body.implementationDetail = implementationDetail
  }

  const findingDetail = flags['finding-detail'] as string | undefined
  if (findingDetail !== undefined) {
    body.findingDetail = findingDetail
  }

  const recommendationDetail = flags['recommendation-detail'] as string | undefined
  if (recommendationDetail !== undefined) {
    body.recommendationDetail = recommendationDetail
  }

  const validationMethods = flags['validation-methods'] as string | undefined
  if (validationMethods !== undefined) {
    body.validationMethods = validationMethods
  }

  return body
}

/**
 * The validated body of a control update request. The documented
 * ControlUpdateDTO marks both fields optional and nullable, so this is a
 * partial update: a field is present only when the user supplied its flag, and
 * an omitted flag leaves the field out of the body. `evaluationId` is a JSON
 * number, so it serializes as the documented int32 integer; `summaryStatement`
 * passes through as a string.
 */
export interface ControlUpdateBody {
  evaluationId?: number
  summaryStatement?: string
}

/**
 * Build the validated control update body from the update command's flags.
 * Runs before profile resolution, so a non-integer evaluation identifier exits
 * 2 with a stable code and zero keyring or network access. Each field is
 * included only when the user supplied its flag, matching the documented
 * partial-update contract.
 */
export function buildControlUpdateBody(flags: Record<string, unknown>): ControlUpdateBody {
  const body: ControlUpdateBody = {}

  const evaluationId = flags['evaluation-id'] as string | undefined
  if (evaluationId !== undefined) {
    body.evaluationId = parseIntegerFlag(evaluationId, 'evaluation-id', 'identifier')
  }

  const summaryStatement = flags['summary-statement'] as string | undefined
  if (summaryStatement !== undefined) {
    body.summaryStatement = summaryStatement
  }

  return body
}

/**
 * One validated element of the documented `authorizationTypes` array. The
 * documented InterconnectionAuthorizationTypeInputDTO has one required int32
 * field, `interconnectionAuthorizationTypeId`, and one optional nullable
 * string field, `otherValue`. `otherValue` is present only when the user
 * supplied it, so an omitted `other=` leaves the field out of the object.
 */
export interface AuthorizationTypeInput {
  interconnectionAuthorizationTypeId: number
  otherValue?: string
}

/**
 * The validated body of an interconnection create request. The documented
 * InterconnectionCreateDTO marks `name`, `authorizingOfficialId`, and
 * `authorizationTypes` required; `provider` and `description` are optional and
 * nullable, so each is present only when the user supplied its flag.
 */
export interface InterconnectionCreateBody {
  name: string
  provider?: string
  description?: string
  authorizingOfficialId: number
  authorizationTypes: AuthorizationTypeInput[]
}

/**
 * The validated body of an interconnection update request. The documented
 * InterconnectionUpdateDTO marks only `name` required; `provider`,
 * `description`, `authorizingOfficialId`, and `authorizationTypes` are optional
 * and nullable. Each optional field is present only when the user supplied its
 * flag, matching the documented partial-update contract. Providing
 * `authorizationTypes` replaces all existing authorization type associations.
 */
export interface InterconnectionUpdateBody {
  name: string
  provider?: string
  description?: string
  authorizingOfficialId?: number
  authorizationTypes?: AuthorizationTypeInput[]
}

/**
 * Build the validated interconnection create body from the create command's
 * flags. Runs before profile resolution, so a non-integer identifier or a
 * malformed authorization-type value exits 2 with a stable code and zero
 * keyring or network access. The `--name`, `--authorizing-official-id`, and
 * `--authorization-type` flags are required, so oclif guarantees they are
 * present; the optional `--provider` and `--description` flags contribute a
 * field only when supplied.
 */
export function buildInterconnectionCreateBody(
  flags: Record<string, unknown>,
): InterconnectionCreateBody {
  const body: InterconnectionCreateBody = {
    name: flags.name as string,
    authorizingOfficialId: parseIntegerFlag(
      flags['authorizing-official-id'] as string,
      'authorizing-official-id',
      'identifier',
    ),
    authorizationTypes: parseAuthorizationTypeList(
      (flags['authorization-type'] as string[] | undefined) ?? [],
    ),
  }

  const provider = flags.provider as string | undefined
  if (provider !== undefined) {
    body.provider = provider
  }

  const description = flags.description as string | undefined
  if (description !== undefined) {
    body.description = description
  }

  return body
}

/**
 * Build the validated interconnection update body from the update command's
 * flags. Runs before profile resolution, so a non-integer identifier or a
 * malformed authorization-type value exits 2 with a stable code and zero
 * keyring or network access. `--name` is required; every other field is
 * included only when the user supplied its flag, matching the documented
 * partial-update contract.
 */
export function buildInterconnectionUpdateBody(
  flags: Record<string, unknown>,
): InterconnectionUpdateBody {
  const body: InterconnectionUpdateBody = {name: flags.name as string}

  const provider = flags.provider as string | undefined
  if (provider !== undefined) {
    body.provider = provider
  }

  const description = flags.description as string | undefined
  if (description !== undefined) {
    body.description = description
  }

  const authorizingOfficialId = flags['authorizing-official-id'] as string | undefined
  if (authorizingOfficialId !== undefined) {
    body.authorizingOfficialId = parseIntegerFlag(
      authorizingOfficialId,
      'authorizing-official-id',
      'identifier',
    )
  }

  const authorizationTypes = flags['authorization-type'] as string[] | undefined
  if (authorizationTypes !== undefined) {
    body.authorizationTypes = parseAuthorizationTypeList(authorizationTypes)
  }

  return body
}

/**
 * Validate the repeatable --authorization-type flag as a list of documented
 * InterconnectionAuthorizationTypeInputDTO objects, one flag occurrence at a
 * time, and return the objects in the order supplied. Each occurrence is one
 * object encoded as comma-separated key=value pairs: `id` (required int32,
 * mapped to `interconnectionAuthorizationTypeId`) and `other` (optional text,
 * mapped to `otherValue`). The first malformed occurrence throws with the
 * shared invalid-authorization-type code so the user learns which value was
 * wrong. This is the CLI convention for supplying an array of structured
 * objects on the command line.
 */
export function parseAuthorizationTypeList(values: string[]): AuthorizationTypeInput[] {
  return values.map((value) => parseAuthorizationType(value))
}

/**
 * Parse and validate one --authorization-type occurrence into one documented
 * authorization-type object. The value is comma-separated key=value pairs; the
 * key/value split is on the first `=`, so an `other` value may itself contain
 * `=`. A missing `id`, a duplicate key, an unknown key, a segment without `=`,
 * or a non-integer `id` throws the shared invalid-authorization-type failure.
 */
function parseAuthorizationType(raw: string): AuthorizationTypeInput {
  let id: number | undefined
  let otherValue: string | undefined
  const seen = new Set<string>()

  for (const segment of raw.split(',')) {
    const separator = segment.indexOf('=')
    if (separator === -1) {
      throw authorizationTypeFailure(
        raw,
        `the segment "${segment}" is not a key=value pair`,
      )
    }

    const key = segment.slice(0, separator).trim()
    const value = segment.slice(separator + 1)

    if (seen.has(key)) {
      throw authorizationTypeFailure(raw, `the key "${key}" appears more than once`)
    }

    seen.add(key)

    if (key === 'id') {
      if (!isInt32(value)) {
        throw authorizationTypeFailure(raw, `the id "${value}" is not an integer`)
      }

      id = Number(value)
    } else if (key === 'other') {
      otherValue = value
    } else {
      throw authorizationTypeFailure(raw, `the key "${key}" is not "id" or "other"`)
    }
  }

  if (id === undefined) {
    throw authorizationTypeFailure(raw, 'the required "id" key is missing')
  }

  const authorizationType: AuthorizationTypeInput = {interconnectionAuthorizationTypeId: id}
  if (otherValue !== undefined) {
    authorizationType.otherValue = otherValue
  }

  return authorizationType
}

/**
 * Build the shared invalid-authorization-type failure. Every malformed
 * --authorization-type value fails the same way: exit 2 with a stable code,
 * before any keyring or network access. `reason` names the specific problem so
 * the user learns exactly what was wrong.
 */
function authorizationTypeFailure(raw: string, reason: string): CliFailure {
  return new CliFailure({
    code: 'invalid-authorization-type',
    message:
      `The value "${raw}" for --authorization-type is not valid: ${reason}. ` +
      'Each --authorization-type is one authorization type, written as ' +
      'comma-separated key=value pairs: id=<integer> for the required ' +
      'interconnectionAuthorizationTypeId, and an optional other=<text> for ' +
      'the otherValue field, for example --authorization-type id=5 or ' +
      '--authorization-type id=7,other="Site-to-site VPN".',
    exitCode: EXIT.invalidInput,
  })
}

/**
 * The validated body of an evaluation create request. The documented
 * EvaluationCreateDTO marks `name`, `reason`, `boundaryId`, `startDate`,
 * `endDate`, `iclVersionId`, and `frameworkIds` required; `totalBudget`,
 * `targetType`, and `previousEvaluationId` are optional, so each is present
 * only when the user supplied its flag. The two date fields are documented as
 * date-time strings; `boundaryId`, `targetType`, and `previousEvaluationId`
 * are JSON numbers (int32); `totalBudget` is a JSON number (double);
 * `frameworkIds` is a required array of UUID strings.
 */
export interface EvaluationCreateBody {
  name: string
  reason: string
  boundaryId: number
  startDate: string
  endDate: string
  totalBudget?: number
  iclVersionId: string
  frameworkIds: string[]
  targetType?: number
  previousEvaluationId?: number
}

/**
 * Build the validated evaluation create body from the create command's flags.
 * Runs before profile resolution, so a non-integer identifier, a non-numeric
 * budget, a malformed UUID, or an invalid date exits 2 with a stable code and
 * zero keyring or network access. The seven required flags are enforced by
 * oclif; each optional field is included only when the user supplied its flag.
 */
export function buildEvaluationCreateBody(flags: Record<string, unknown>): EvaluationCreateBody {
  const body: EvaluationCreateBody = {
    name: flags.name as string,
    reason: flags.reason as string,
    boundaryId: parseIntegerFlag(flags['boundary-id'] as string, 'boundary-id', 'identifier'),
    startDate: parseDateFlag(flags['start-date'] as string, 'start-date'),
    endDate: parseDateFlag(flags['end-date'] as string, 'end-date'),
    iclVersionId: parseIclVersionId(flags['icl-version-id'] as string),
    frameworkIds: parseFrameworkIdList((flags['framework-id'] as string[] | undefined) ?? []),
  }

  const totalBudget = flags['total-budget'] as string | undefined
  if (totalBudget !== undefined) {
    body.totalBudget = parseNumberFlag(totalBudget, 'total-budget', 'amount')
  }

  const targetType = flags['target-type'] as string | undefined
  if (targetType !== undefined) {
    body.targetType = parseIntegerFlag(targetType, 'target-type', 'target type')
  }

  const previousEvaluationId = flags['previous-evaluation-id'] as string | undefined
  if (previousEvaluationId !== undefined) {
    body.previousEvaluationId = parseIntegerFlag(
      previousEvaluationId,
      'previous-evaluation-id',
      'identifier',
    )
  }

  return body
}

/**
 * The validated body of a boundary create request. This is the largest
 * documented write body: the documented BoundaryCreateDTO marks `name`,
 * `uniqueIdentifier`, `operationalStatusId`, and `systemTypeId` required; every
 * other field is optional and nullable, so each is present only when the user
 * supplied its flag. The scalar identifier fields are JSON numbers (int32); the
 * six `*Ids` arrays hold int32 numbers; `frameworkIds` holds UUID strings; and
 * `cageCodes` holds plain strings.
 */
export interface BoundaryCreateBody {
  name: string
  uniqueIdentifier: string
  operationalStatusId: number
  systemTypeId: number
  description?: string
  systemEnvironment?: string
  networkArchitectureDetails?: string
  operationalStatusDetails?: string
  informationSystemTypeId?: number
  informationSystemTypeDetails?: string
  confidentialityId?: number
  integrityId?: number
  availabilityId?: number
  securityCategoryId?: number
  networkDiagramId?: number
  dataFlowDiagramId?: number
  deviceIds?: number[]
  locationIds?: number[]
  sensitiveInformationTypeIds?: number[]
  interconnectionIds?: number[]
  lawRegulationPolicyIds?: number[]
  personnelIds?: number[]
  frameworkIds?: string[]
  cageCodes?: string[]
}

/**
 * Build the validated boundary create body from the create command's flags.
 * Runs before profile resolution, so a non-integer identifier or a malformed
 * UUID in any scalar or array field exits 2 with a stable code and zero keyring
 * or network access. The four required flags are enforced by oclif; each
 * optional scalar or array field is included only when the user supplied its
 * flag, so an omitted flag leaves the field out of the body entirely.
 */
export function buildBoundaryCreateBody(flags: Record<string, unknown>): BoundaryCreateBody {
  const body: BoundaryCreateBody = {
    name: flags.name as string,
    uniqueIdentifier: flags['unique-identifier'] as string,
    operationalStatusId: parseIntegerFlag(
      flags['operational-status-id'] as string,
      'operational-status-id',
      'identifier',
    ),
    systemTypeId: parseIntegerFlag(flags['system-type-id'] as string, 'system-type-id', 'identifier'),
  }

  assignOptionalString(body, 'description', flags.description)
  assignOptionalString(body, 'systemEnvironment', flags['system-environment'])
  assignOptionalString(body, 'networkArchitectureDetails', flags['network-architecture-details'])
  assignOptionalString(body, 'operationalStatusDetails', flags['operational-status-details'])
  assignOptionalString(body, 'informationSystemTypeDetails', flags['information-system-type-details'])

  assignOptionalInt(body, 'informationSystemTypeId', flags['information-system-type-id'], 'information-system-type-id')
  assignOptionalInt(body, 'confidentialityId', flags['confidentiality-id'], 'confidentiality-id')
  assignOptionalInt(body, 'integrityId', flags['integrity-id'], 'integrity-id')
  assignOptionalInt(body, 'availabilityId', flags['availability-id'], 'availability-id')
  assignOptionalInt(body, 'securityCategoryId', flags['security-category-id'], 'security-category-id')
  assignOptionalInt(body, 'networkDiagramId', flags['network-diagram-id'], 'network-diagram-id')
  assignOptionalInt(body, 'dataFlowDiagramId', flags['data-flow-diagram-id'], 'data-flow-diagram-id')

  assignOptionalInt32List(body, 'deviceIds', flags['device-id'], 'device-id', 'device')
  assignOptionalInt32List(body, 'locationIds', flags['location-id'], 'location-id', 'location')
  assignOptionalInt32List(
    body,
    'sensitiveInformationTypeIds',
    flags['sensitive-information-type-id'],
    'sensitive-information-type-id',
    'sensitive information type',
  )
  assignOptionalInt32List(body, 'interconnectionIds', flags['interconnection-id'], 'interconnection-id', 'interconnection')
  assignOptionalInt32List(
    body,
    'lawRegulationPolicyIds',
    flags['law-regulation-policy-id'],
    'law-regulation-policy-id',
    'law, regulation, or policy',
  )
  assignOptionalInt32List(body, 'personnelIds', flags['personnel-id'], 'personnel-id', 'personnel')

  const frameworkIds = flags['framework-id'] as string[] | undefined
  if (frameworkIds !== undefined) {
    body.frameworkIds = parseFrameworkIdList(frameworkIds)
  }

  const cageCodes = flags['cage-code'] as string[] | undefined
  if (cageCodes !== undefined) {
    body.cageCodes = cageCodes
  }

  return body
}

/**
 * The keys of T whose value type is assignable to V, ignoring the optional
 * modifier (so `field?: number` counts as a number key). Each optional-field
 * assigner constrains its `field` parameter with this, so pairing an assigner
 * with a field of the wrong type — for example a string assigner with a numeric
 * field — is a compile error, not just a wrong runtime write.
 */
type KeysMatching<T, V> = {
  [K in keyof T]-?: Exclude<T[K], undefined> extends V ? K : never
}[keyof T] &
  string

/**
 * The optional-field assigners below build the many optional fields of the
 * large create bodies (boundary and the three action-plan commands). Each
 * assigns one field only when its flag was supplied, so an omitted flag (oclif
 * passes undefined) leaves the field out of the body entirely. `field` is
 * constrained to a key of the body whose declared type matches the assigner, so
 * both a typo and a type mismatch are compile errors; the value is written
 * through a Record view. Every validating assigner runs before profile
 * resolution, so an invalid value exits 2 with the flag-specific code before
 * any keyring or network access.
 */

/** Assign one optional string body field when its flag was supplied. */
function assignOptionalString<T>(body: T, field: KeysMatching<T, string>, raw: unknown): void {
  if (raw !== undefined) {
    ;(body as Record<string, unknown>)[field] = raw as string
  }
}

/**
 * Assign one optional int32 body field, validating it as a documented int32
 * integer. `label` names the kind of value in the failure message; it defaults
 * to "identifier" because most int32 body fields hold one, and a caller whose
 * field holds a different kind of number (for example an employee count)
 * passes its own label.
 */
function assignOptionalInt<T>(
  body: T,
  field: KeysMatching<T, number>,
  raw: unknown,
  flagName: string,
  label = 'identifier',
): void {
  if (raw !== undefined) {
    ;(body as Record<string, unknown>)[field] = parseIntegerFlag(raw as string, flagName, label)
  }
}

/** Assign one optional number body field, validating it as a documented double. */
function assignOptionalNumber<T>(body: T, field: KeysMatching<T, number>, raw: unknown, flagName: string): void {
  if (raw !== undefined) {
    ;(body as Record<string, unknown>)[field] = parseNumberFlag(raw as string, flagName, 'amount')
  }
}

/**
 * Assign one optional date-time body field, validating a calendar date and
 * sending it at midnight UTC (the shared date-flag rule). The documented field
 * is a string, so this constrains to string keys like the string assigner.
 */
function assignOptionalDate<T>(body: T, field: KeysMatching<T, string>, raw: unknown, flagName: string): void {
  if (raw !== undefined) {
    ;(body as Record<string, unknown>)[field] = parseDateFlag(raw as string, flagName)
  }
}

/**
 * Assign one optional boolean body field. The flag's allowed values constrain
 * the input to "true" or "false", so the value maps directly to a JSON boolean.
 */
function assignOptionalBoolean<T>(body: T, field: KeysMatching<T, boolean>, raw: unknown): void {
  if (raw !== undefined) {
    ;(body as Record<string, unknown>)[field] = raw === 'true'
  }
}

/** Assign one optional int32-array body field, validating each element as an int32. */
function assignOptionalInt32List<T>(
  body: T,
  field: KeysMatching<T, number[]>,
  raw: unknown,
  flagName: string,
  itemLabel: string,
): void {
  if (raw !== undefined) {
    ;(body as Record<string, unknown>)[field] = parseInt32List(
      raw as string[],
      `invalid-${flagName}`,
      flagName,
      itemLabel,
      field,
    )
  }
}

/** Assign one optional UUID-array body field, validating each element as a UUID. */
function assignOptionalUuidList<T>(
  body: T,
  field: KeysMatching<T, string[]>,
  raw: unknown,
  flagName: string,
  itemLabel: string,
): void {
  if (raw !== undefined) {
    ;(body as Record<string, unknown>)[field] = parseUuidList(
      raw as string[],
      `invalid-${flagName}`,
      flagName,
      itemLabel,
      field,
    )
  }
}

/**
 * The validated body of a facility create or update request. The documented
 * FacilityCreateDTO and FacilityUpdateDTO carry the identical fourteen scalar
 * fields and mark only `name` required, so both commands build this one shape.
 * `locationTypeId`, `employeeCount`, and `primaryContactId` are JSON numbers,
 * so they serialize as the documented int32 integers rather than strings.
 * Every other field is a string. An optional field is present only when the
 * user supplied its flag.
 */
export interface FacilityWriteBody {
  name: string
  description?: string
  locationTypeId?: number
  address?: string
  addressLine2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  phoneNumber?: string
  website?: string
  faxNumber?: string
  employeeCount?: number
  primaryContactId?: number
}

/**
 * Build the validated facility body from the create or update command's flags.
 * The two documented DTOs share one field set, so one builder serves both
 * commands. It runs before profile resolution, so a non-integer value in any
 * of the three integer flags exits 2 with a stable code and zero keyring or
 * network access. The required --name flag is enforced by oclif; each optional
 * field is included only when its flag is supplied. The CLI does not check the
 * documented string constraints on `state`, `zipCode`, and `website` — the
 * IntelliGRC API is the authority that accepts or rejects a value.
 */
export function buildFacilityWriteBody(flags: Record<string, unknown>): FacilityWriteBody {
  const body: FacilityWriteBody = {name: flags.name as string}

  assignOptionalString(body, 'description', flags.description)
  assignOptionalInt(body, 'locationTypeId', flags['location-type-id'], 'location-type-id')
  assignOptionalString(body, 'address', flags.address)
  assignOptionalString(body, 'addressLine2', flags['address-line2'])
  assignOptionalString(body, 'city', flags.city)
  assignOptionalString(body, 'state', flags.state)
  assignOptionalString(body, 'zipCode', flags['zip-code'])
  assignOptionalString(body, 'country', flags.country)
  assignOptionalString(body, 'phoneNumber', flags['phone-number'])
  assignOptionalString(body, 'website', flags.website)
  assignOptionalString(body, 'faxNumber', flags['fax-number'])
  assignOptionalInt(body, 'employeeCount', flags['employee-count'], 'employee-count', 'employee count')
  assignOptionalInt(body, 'primaryContactId', flags['primary-contact-id'], 'primary-contact-id')

  return body
}

/**
 * The validated body of an evidence link create request. The documented
 * EvidenceLinkCreateDTO marks `fileName` and `url` required; `description` and
 * `parentId` are optional and nullable, so each is present only when the user
 * supplied its flag. `parentId` is a documented UUID, and `url` is a documented
 * uri-formatted string that the API validates.
 */
export interface EvidenceLinkCreateBody {
  fileName: string
  url: string
  description?: string
  parentId?: string
}

/**
 * Build the validated evidence link create body. Runs before profile
 * resolution, so a --parent-id that is not a UUID exits 2 with a stable code
 * and zero keyring or network access. The required --file-name and --url flags
 * are enforced by oclif. The CLI does not check that --url is a well-formed
 * uniform resource identifier — the IntelliGRC API is the authority that
 * accepts or rejects a value, as it is for every other documented string
 * constraint.
 */
export function buildEvidenceLinkCreateBody(flags: Record<string, unknown>): EvidenceLinkCreateBody {
  const body: EvidenceLinkCreateBody = {
    fileName: flags['file-name'] as string,
    url: flags.url as string,
  }

  assignOptionalString(body, 'description', flags.description)
  assignOptionalParentId(body, flags['parent-id'])

  return body
}

/**
 * The validated body of an evidence folder create request. The documented
 * EvidenceFolderCreateDTO marks `name` required; `parentId` is optional and
 * nullable. Leaving `parentId` out creates the folder at the root, which is the
 * documented meaning of a null parent.
 */
export interface EvidenceFolderCreateBody {
  name: string
  parentId?: string
}

/**
 * Build the validated evidence folder create body. Runs before profile
 * resolution, so a --parent-id that is not a UUID exits 2 with a stable code
 * and zero keyring or network access. The required --name flag is enforced by
 * oclif. The CLI does not check the documented rule that a folder name must be
 * unique within its parent — the API enforces it and replies 409 Conflict.
 */
export function buildEvidenceFolderCreateBody(flags: Record<string, unknown>): EvidenceFolderCreateBody {
  const body: EvidenceFolderCreateBody = {name: flags.name as string}

  assignOptionalParentId(body, flags['parent-id'])

  return body
}

/**
 * Assign the documented optional `parentId` body field, shared by the two
 * evidence create bodies. The failure code matches the one the folder-list
 * query parameter already uses, so one flag name always produces one code.
 */
function assignOptionalParentId(body: {parentId?: string}, raw: unknown): void {
  if (raw !== undefined) {
    body.parentId = parseUuid(raw as string, 'invalid-parent-id', 'parent folder', 'parentId field')
  }
}

/**
 * The validated body of a personnel create or update request. The documented
 * PersonnelCreateDTO and PersonnelUpdateDTO carry the identical twelve scalar
 * fields and mark `firstName` and `lastName` required, so both commands build
 * this one shape. `userTypeId` is a JSON number, so it serializes as the
 * documented int32 integer rather than a string. Every other field is a
 * string. An optional field is present only when the user supplied its flag.
 *
 * `department_CD` keeps the documented field name, including its underscore
 * and capitals, because output and input preserve upstream field names.
 */
export interface PersonnelWriteBody {
  firstName: string
  lastName: string
  middleName?: string
  title?: string
  description?: string
  emailAddress?: string
  phoneNumber?: string
  officeNumber?: string
  networkUserName?: string
  department_CD?: string
  adDomain?: string
  userTypeId?: number
}

/**
 * Build the validated personnel body from the create or update command's
 * flags. The two documented DTOs share one field set, so one builder serves
 * both commands. It runs before profile resolution, so a non-integer
 * --user-type-id exits 2 with a stable code and zero keyring or network
 * access. The required --first-name and --last-name flags are enforced by
 * oclif; each optional field is included only when its flag is supplied. The
 * CLI does not check --user-type-id against any catalog — the IntelliGRC API
 * is the authority that accepts or rejects a value.
 */
export function buildPersonnelWriteBody(flags: Record<string, unknown>): PersonnelWriteBody {
  const body: PersonnelWriteBody = {
    firstName: flags['first-name'] as string,
    lastName: flags['last-name'] as string,
  }

  assignOptionalString(body, 'middleName', flags['middle-name'])
  assignOptionalString(body, 'title', flags.title)
  assignOptionalString(body, 'description', flags.description)
  assignOptionalString(body, 'emailAddress', flags['email-address'])
  assignOptionalString(body, 'phoneNumber', flags['phone-number'])
  assignOptionalString(body, 'officeNumber', flags['office-number'])
  assignOptionalString(body, 'networkUserName', flags['network-user-name'])
  assignOptionalString(body, 'department_CD', flags['department-cd'])
  assignOptionalString(body, 'adDomain', flags['ad-domain'])
  assignOptionalInt(body, 'userTypeId', flags['user-type-id'], 'user-type-id')

  return body
}

/**
 * The validated body of an action-plan project create request. The documented
 * ActionPlanProjectCreateDTO marks `name`, `description`, and `statusId`
 * required; every other field is optional and (except the arrays' presence)
 * nullable, so each optional field is present only when the user supplied its
 * flag. `costEstimate` is a double number; `dueDate` is a date-time string;
 * the three `assigned*Ids` fields are int32 arrays.
 */
export interface ActionPlanProjectCreateBody {
  name: string
  description: string
  statusId: number
  costEstimate?: number
  dueDate?: string
  evaluationId?: number
  assignedDepartmentIds?: number[]
  assignedPersonnelIds?: number[]
  assignedWatcherIds?: number[]
  levelOfEffortId?: number
  priorityLevelId?: number
  subCategoryId?: number
}

/**
 * Build the validated action-plan project create body. Runs before profile
 * resolution, so an invalid integer, number, or date exits 2 with a stable
 * code and zero keyring or network access. The three required flags are
 * enforced by oclif; each optional field is included only when its flag is
 * supplied.
 */
export function buildActionPlanProjectCreateBody(
  flags: Record<string, unknown>,
): ActionPlanProjectCreateBody {
  const body: ActionPlanProjectCreateBody = {
    name: flags.name as string,
    description: flags.description as string,
    statusId: parseIntegerFlag(flags['status-id'] as string, 'status-id', 'identifier'),
  }

  assignOptionalNumber(body, 'costEstimate', flags['cost-estimate'], 'cost-estimate')
  assignOptionalDate(body, 'dueDate', flags['due-date'], 'due-date')
  assignOptionalInt(body, 'evaluationId', flags['evaluation-id'], 'evaluation-id')
  assignActionPlanAssignments(body, flags)
  assignActionPlanClassification(body, flags)

  return body
}

/**
 * The validated body of an action-plan task create request. The documented
 * ActionPlanTaskCreateDTO marks `name`, `description`, `statusId`, and
 * `taskTypeId` required; every other field is optional. `budget` is a double
 * number; `scheduledCompletionDate` is a date-time string; `projectId` is a
 * UUID; `assignedAssessmentObjectiveIds` is a UUID array; the other
 * `assigned*Ids` are int32 arrays; `isAssignedToOrganization` is a boolean.
 */
export interface ActionPlanTaskCreateBody {
  name: string
  description: string
  statusId: number
  taskTypeId: number
  budget?: number
  scheduledCompletionDate?: string
  projectId?: string
  evaluationId?: number
  assignedDepartmentIds?: number[]
  assignedPersonnelIds?: number[]
  assignedWatcherIds?: number[]
  assignedAssessmentObjectiveIds?: string[]
  levelOfEffortId?: number
  priorityLevelId?: number
  subCategoryId?: number
  isAssignedToOrganization?: boolean
  assignedExternalOrganization?: string
}

/**
 * Build the validated action-plan task create body. Runs before profile
 * resolution, so an invalid integer, number, date, or UUID exits 2 with a
 * stable code and zero keyring or network access. The four required flags are
 * enforced by oclif; each optional field is included only when its flag is
 * supplied.
 */
export function buildActionPlanTaskCreateBody(
  flags: Record<string, unknown>,
): ActionPlanTaskCreateBody {
  const body: ActionPlanTaskCreateBody = {
    name: flags.name as string,
    description: flags.description as string,
    statusId: parseIntegerFlag(flags['status-id'] as string, 'status-id', 'identifier'),
    taskTypeId: parseIntegerFlag(flags['task-type-id'] as string, 'task-type-id', 'identifier'),
  }

  assignOptionalNumber(body, 'budget', flags.budget, 'budget')
  assignOptionalDate(body, 'scheduledCompletionDate', flags['scheduled-completion-date'], 'scheduled-completion-date')

  const projectId = flags['project-id'] as string | undefined
  if (projectId !== undefined) {
    body.projectId = parseUuid(projectId, 'invalid-project-id', 'project', 'projectId field')
  }

  assignOptionalInt(body, 'evaluationId', flags['evaluation-id'], 'evaluation-id')
  assignActionPlanAssignments(body, flags)
  assignOptionalUuidList(
    body,
    'assignedAssessmentObjectiveIds',
    flags['assigned-assessment-objective-id'],
    'assigned-assessment-objective-id',
    'assessment objective',
  )
  assignActionPlanClassification(body, flags)
  assignActionPlanOrganization(body, flags)

  return body
}

/**
 * The validated body of an action-plan subtask create request. The documented
 * ActionPlanSubTaskCreateDTO marks `title`, `description`, `taskId`, and
 * `statusId` required; every other field is optional. `taskId` is a UUID;
 * `costEstimate` is a double number; `scheduledCompletionDate` is a date-time
 * string; the `assigned*Ids` are int32 arrays; `isAssignedToOrganization` is a
 * boolean.
 */
export interface ActionPlanSubTaskCreateBody {
  title: string
  description: string
  taskId: string
  statusId: number
  costEstimate?: number
  scheduledCompletionDate?: string
  assignedDepartmentIds?: number[]
  assignedPersonnelIds?: number[]
  assignedWatcherIds?: number[]
  levelOfEffortId?: number
  priorityLevelId?: number
  subCategoryId?: number
  isAssignedToOrganization?: boolean
  assignedExternalOrganization?: string
}

/**
 * Build the validated action-plan subtask create body. Runs before profile
 * resolution, so an invalid integer, number, date, or UUID exits 2 with a
 * stable code and zero keyring or network access. The four required flags are
 * enforced by oclif; each optional field is included only when its flag is
 * supplied.
 */
export function buildActionPlanSubTaskCreateBody(
  flags: Record<string, unknown>,
): ActionPlanSubTaskCreateBody {
  const body: ActionPlanSubTaskCreateBody = {
    title: flags.title as string,
    description: flags.description as string,
    taskId: parseUuid(flags['task-id'] as string, 'invalid-task-id', 'task', 'taskId field'),
    statusId: parseIntegerFlag(flags['status-id'] as string, 'status-id', 'identifier'),
  }

  assignOptionalNumber(body, 'costEstimate', flags['cost-estimate'], 'cost-estimate')
  assignOptionalDate(body, 'scheduledCompletionDate', flags['scheduled-completion-date'], 'scheduled-completion-date')
  assignActionPlanAssignments(body, flags)
  assignActionPlanClassification(body, flags)
  assignActionPlanOrganization(body, flags)

  return body
}

/**
 * The three optional field groups shared across the action-plan create bodies.
 * Each helper takes the minimal structural shape it assigns, so a full body
 * type is structurally assignable and the KeysMatching constraint resolves to
 * concrete keys. The parallel manifest field arrays
 * (actionPlanAssignmentFields, actionPlanClassificationFields,
 * actionPlanOrganizationFields) document the same groups.
 */
interface ActionPlanAssignmentFields {
  assignedDepartmentIds?: number[]
  assignedPersonnelIds?: number[]
  assignedWatcherIds?: number[]
}

interface ActionPlanClassificationFields {
  levelOfEffortId?: number
  priorityLevelId?: number
  subCategoryId?: number
}

interface ActionPlanOrganizationFields {
  isAssignedToOrganization?: boolean
  assignedExternalOrganization?: string
}

/**
 * Assign the three int32 assignment arrays (`assignedDepartmentIds`,
 * `assignedPersonnelIds`, `assignedWatcherIds`) shared by all three action-plan
 * create bodies, from their repeatable flags. Each is included only when its
 * flag is supplied.
 */
function assignActionPlanAssignments(body: ActionPlanAssignmentFields, flags: Record<string, unknown>): void {
  assignOptionalInt32List(body, 'assignedDepartmentIds', flags['assigned-department-id'], 'assigned-department-id', 'department')
  assignOptionalInt32List(body, 'assignedPersonnelIds', flags['assigned-personnel-id'], 'assigned-personnel-id', 'personnel')
  assignOptionalInt32List(body, 'assignedWatcherIds', flags['assigned-watcher-id'], 'assigned-watcher-id', 'watcher')
}

/**
 * Assign the three optional int32 classification fields (`levelOfEffortId`,
 * `priorityLevelId`, `subCategoryId`) shared by all three action-plan create
 * bodies. Each is included only when its flag is supplied.
 */
function assignActionPlanClassification(body: ActionPlanClassificationFields, flags: Record<string, unknown>): void {
  assignOptionalInt(body, 'levelOfEffortId', flags['level-of-effort-id'], 'level-of-effort-id')
  assignOptionalInt(body, 'priorityLevelId', flags['priority-level-id'], 'priority-level-id')
  assignOptionalInt(body, 'subCategoryId', flags['sub-category-id'], 'sub-category-id')
}

/**
 * Assign the optional organization fields (`isAssignedToOrganization`,
 * `assignedExternalOrganization`) shared by the task and subtask create bodies.
 * Each is included only when its flag is supplied.
 */
function assignActionPlanOrganization(body: ActionPlanOrganizationFields, flags: Record<string, unknown>): void {
  assignOptionalBoolean(body, 'isAssignedToOrganization', flags['is-assigned-to-organization'])
  assignOptionalString(body, 'assignedExternalOrganization', flags['assigned-external-organization'])
}

/**
 * Validate the repeatable --framework-id flag as a list of documented UUIDs,
 * one element at a time, and return the values in the order supplied. The flag
 * is required, so oclif guarantees at least one value; the `?? []` guard keeps
 * the builder total for direct callers. The first malformed element throws
 * with the shared invalid-framework-id code so the user learns which value was
 * wrong. This mirrors the assessment-objective UUID array parser.
 */
export function parseFrameworkIdList(values: string[]): string[] {
  return parseUuidList(values, 'invalid-framework-id', 'framework-id', 'framework', 'frameworkIds')
}

/**
 * Validate one calendar-date flag and return the documented date-time string
 * it maps to. The documented field is a date-time, and the flag names a date,
 * so the CLI accepts a calendar date in YYYY-MM-DD form and sends it at
 * midnight UTC, for example 2026-07-24 becomes 2026-07-24T00:00:00Z. The value
 * must be a real calendar day: a round-trip through UTC rejects an impossible
 * date such as 2026-02-30, and the fixed form rejects a bare date-time so the
 * sent instant is never ambiguous. A malformed value throws exit 2 with the
 * flag-specific code, before any keyring or network access.
 */
function parseDateFlag(raw: string, flagName: string): string {
  if (CALENDAR_DATE_PATTERN.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return `${raw}T00:00:00Z`
    }
  }

  throw new CliFailure({
    code: `invalid-${flagName}`,
    message:
      `The value "${raw}" for --${flagName} is not a valid date. Use a ` +
      'calendar date in YYYY-MM-DD form, for example 2026-07-24. The CLI ' +
      'sends it as the documented date-time field at midnight UTC ' +
      '(2026-07-24T00:00:00Z).',
    exitCode: EXIT.invalidInput,
  })
}

/**
 * Validate one number body-field flag as a documented finite decimal and
 * return its numeric value, so it serializes as the documented "number,
 * format: double" field rather than a string. The flag name appears in the
 * stable error code and the message; `label` names the kind of value, for
 * example "amount" for a budget. A non-numeric value throws exit 2 before any
 * keyring or network access.
 */
function parseNumberFlag(raw: string, flagName: string, label: string): number {
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new CliFailure({
      code: `invalid-${flagName}`,
      message:
        `The value "${raw}" for --${flagName} is not a valid ${label}. ` +
        'The documented field is a number, for example 50000 or 50000.50.',
      exitCode: EXIT.invalidInput,
    })
  }

  return Number(raw)
}

/**
 * Validate one integer body-field flag as a documented int32 integer and
 * return its numeric value. The flag name appears in the stable error code and
 * the message so the user learns exactly which flag was wrong; `label` names
 * the kind of identifier in the message, for example "level identifier" for a
 * data-type level flag or "identifier" for an evaluation or status flag.
 */
function parseIntegerFlag(raw: string, flagName: string, label: string): number {
  if (!isInt32(raw)) {
    throw new CliFailure({
      code: `invalid-${flagName}`,
      message:
        `The value "${raw}" for --${flagName} is not a valid ${label}. ` +
        'The documented field is an integer.',
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

/**
 * Validate one evidence identifier argument as a universally unique
 * identifier. The documented {id} path parameter of the evidence
 * assessment-objectives operation is a UUID, unlike the integer identifiers
 * of the facility and interconnection association paths.
 */
export function parseEvidenceId(raw: string): string {
  return parseUuid(raw, 'invalid-evidence-id', 'evidence', 'id path parameter')
}

/**
 * Validate one control identifier argument as a universally unique identifier.
 * The documented {controlId} path parameter of the control update operation is
 * a UUID, unlike the integer identifiers of the facility and interconnection
 * association paths.
 */
export function parseControlId(raw: string): string {
  return parseUuid(raw, 'invalid-control-id', 'control', 'controlId path parameter')
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
