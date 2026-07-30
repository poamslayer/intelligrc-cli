/**
 * Typed command manifest. Single source of truth for the command catalog.
 * Command classes derive their summaries and flag definitions from these
 * specs through commandSpec() and oclifFlags(), so the catalog cannot drift
 * from actual command behavior.
 *
 * Later slices extend this file with API commands and reuse it for command
 * registration checks, help text, permission text, and contract tests.
 */
import {Args, Flags, type Interfaces} from '@oclif/core'

import {OUTPUT_FORMATS} from './output.js'

export interface FlagSpec {
  name: string
  type: 'option' | 'boolean'
  required: boolean
  allowedValues?: string[]
  default?: string
  /**
   * True when the user may supply the flag more than once to build a list,
   * for example `--data-type-id 1 --data-type-id 2`. Absent for a flag that
   * takes at most one value.
   */
  multiple?: boolean
  summary: string
}

export interface ArgSpec {
  name: string
  type: 'string' | 'integer'
  required: boolean
  summary: string
}

/**
 * One documented request parameter and the CLI input that supplies it.
 * Every field except `source` copies the archived OpenAPI document
 * verbatim; the contract suite compares them by exact equality.
 */
export interface ParameterContract {
  /** Documented parameter name, for example "evaluationId". */
  name: string
  in: 'query' | 'path'
  required: boolean
  /** Documented schema type, for example "integer". */
  type: string
  /** Documented schema format, for example "int32". Absent when undocumented. */
  format?: string
  /** Documented default value, copied verbatim. Absent when undocumented. */
  default?: unknown
  /** The CLI flag or argument that supplies this parameter. */
  source: {kind: 'flag' | 'arg'; name: string}
}

/**
 * One documented sub-field of an object array item. This is the nested
 * counterpart of RequestBodyFieldContract, without a `source`: one repeatable
 * flag supplies the whole array and encodes each sub-field within its value,
 * so a sub-field has no flag of its own. Every field copies the archived
 * item DTO schema verbatim; the contract suite compares them by exact equality.
 */
export interface RequestBodyItemFieldContract {
  /** Documented JSON field name, for example "interconnectionAuthorizationTypeId". */
  name: string
  /** Documented schema type, for example "integer" or "string". */
  type: string
  /** Documented schema format, for example "int32". Absent when undocumented. */
  format?: string
  /** True when the item DTO lists the sub-field in its required set. */
  required: boolean
  /** True when the documented schema marks the sub-field nullable. */
  nullable?: boolean
}

/**
 * The documented schema of one array item. A scalar item records only its
 * type and optional format, for example integer/int32 or string/uuid. An
 * object item (a $ref to a nested DTO in the archived document) records type
 * "object" and the contract of each of its documented sub-fields.
 */
export interface RequestBodyItemContract {
  /** Documented item type: a scalar type, or "object" for a $ref item. */
  type: string
  /** Documented item format, for example "int32". Absent for an object item. */
  format?: string
  /**
   * Present for an object item: the contract of each documented sub-field.
   * Absent for a scalar item. The contract suite resolves the documented
   * item $ref and compares these against its properties exactly as it compares
   * the top-level body fields.
   */
  fields?: RequestBodyItemFieldContract[]
}

/**
 * One documented request-body field and the CLI flag that supplies it.
 * Every field except `source` copies the archived OpenAPI document's data
 * transfer object (DTO) schema verbatim; the contract suite compares them by
 * exact equality.
 */
export interface RequestBodyFieldContract {
  /** Documented JSON field name, for example "confidentialityId". */
  name: string
  /** Documented schema type, for example "integer", "string", or "array". */
  type: string
  /** Documented schema format, for example "int32". Absent when undocumented. */
  format?: string
  /**
   * For an array field (type "array"), the documented schema of one array
   * item — a scalar item (for example integer/int32) or an object item (a
   * nested DTO). Absent for a scalar field. The contract suite compares this
   * against the documented `items` schema exactly as it compares a scalar
   * field's own type and format.
   */
  items?: RequestBodyItemContract
  /** True when the DTO lists the field in its required set. */
  required: boolean
  /** True when the documented schema marks the field nullable. */
  nullable?: boolean
  /** The CLI flag that supplies this field. */
  source: {kind: 'flag'; name: string}
}

/**
 * The documented operation one API command maps to. The path is the exact
 * documented string; a path template keeps its "{name}" placeholder and
 * the command substitutes the validated identifier at run time. A write
 * operation (post, put, or delete) may also document a request-body field
 * contract; a read (get) never does.
 */
export interface OperationContract {
  method: 'get' | 'post' | 'put' | 'delete'
  path: string
  parameters: ParameterContract[]
  requestBody?: RequestBodyFieldContract[]
}

export interface CommandSpec {
  id: string
  summary: string
  /**
   * 'local' commands never contact a network service. 'profile' commands
   * manage or diagnose local profiles; among them `auth login` and `doctor`
   * send one request each to the documented tenant-list operation. 'api'
   * commands map to one documented GET operation through the guarded
   * request runtime.
   */
  kind: 'local' | 'profile' | 'api'
  /**
   * Documented IntelliGRC permission, formatted "<Area>: <Permission>"
   * from the operation's permission table. Null for local and profile
   * commands, and for API operations whose contract documents no
   * permission (the tenant-list operation). The CLI never checks whether
   * the selected profile holds a documented permission.
   */
  permission: string | null
  args: ArgSpec[]
  flags: FlagSpec[]
  /**
   * Present exactly on API commands: the documented method, path, and
   * parameters of the one operation the command maps to. The contract
   * suite compares this field against the archived OpenAPI document.
   */
  contract?: OperationContract
}

/** An API command's spec, with the contract guaranteed present. */
export type ApiCommandSpec = CommandSpec & {kind: 'api'; contract: OperationContract}

/**
 * Shared flag literals for API commands. One definition per flag keeps
 * the wording and allowed values identical across the command specs.
 */
const profileFlag: FlagSpec = {
  name: 'profile',
  type: 'option',
  required: true,
  summary: 'Profile that supplies the credential, tenant, and base URL.',
}

const apiOutputFlag: FlagSpec = {
  name: 'output',
  type: 'option',
  required: false,
  allowedValues: [...OUTPUT_FORMATS],
  default: 'json',
  summary: 'Output format.',
}

const evaluationIdFlag: FlagSpec = {
  name: 'evaluation-id',
  type: 'option',
  required: false,
  summary:
    'Integer evaluation identifier, sent as the documented evaluationId ' +
    'query parameter. Omitted from the request when not given.',
}

const frameworkIdFlag: FlagSpec = {
  name: 'framework-id',
  type: 'option',
  required: false,
  summary:
    'Framework identifier (UUID), sent as the documented frameworkId ' +
    'query parameter. Omitted from the request when not given.',
}

const includeTasksFlag: FlagSpec = {
  name: 'include-tasks',
  type: 'option',
  required: false,
  allowedValues: ['true', 'false'],
  summary:
    'Explicit true or false, sent as the documented includeTasks ' +
    'query parameter. Omitted from the request when not given, so ' +
    'the server applies its documented default (true).',
}

const includeSubTasksFlag: FlagSpec = {
  name: 'include-subtasks',
  type: 'option',
  required: false,
  allowedValues: ['true', 'false'],
  summary:
    'Explicit true or false, sent as the documented includeSubTasks ' +
    'query parameter. Omitted from the request when not given, so ' +
    'the server applies its documented default (true).',
}

const assessmentObjectiveIdFlag: FlagSpec = {
  name: 'assessment-objective-id',
  type: 'option',
  required: true,
  summary:
    'Assessment objective identifier (UUID), sent as the documented ' +
    'assessmentObjectiveId query parameter.',
}

const parentIdQueryFlag: FlagSpec = {
  name: 'parent-id',
  type: 'option',
  required: false,
  summary:
    'Parent folder identifier (UUID), sent as the documented parentId ' +
    'query parameter. Omitted from the request when not given, which ' +
    'lists all folders.',
}

/**
 * Flag literals for the two evidence create commands. The documented
 * EvidenceLinkCreateDTO marks `fileName` and `url` required, and the documented
 * EvidenceFolderCreateDTO marks `name` required. Both bodies carry the same
 * optional `parentId` field, so both commands share `parentIdBodyFlag` below.
 * That one flag drops the `evidence` prefix the others carry, because its name
 * pairs with `parentIdQueryFlag`, the query-parameter variant the
 * evidence-folder list command sends.
 */
const evidenceFileNameFlag: FlagSpec = {
  name: 'file-name',
  type: 'option',
  required: true,
  summary: 'Display name for the evidence, sent as the required "fileName" body field.',
}

const evidenceUrlFlag: FlagSpec = {
  name: 'url',
  type: 'option',
  required: true,
  summary:
    'Web address the evidence links to, sent as the required "url" body ' +
    'field. The documented field holds a uniform resource identifier (URI), ' +
    'for example https://example.com/policy.pdf.',
}

const evidenceDescriptionFlag: FlagSpec = {
  name: 'description',
  type: 'option',
  required: false,
  summary:
    'Optional description of the evidence, sent as the "description" body ' +
    'field. Omitted from the body when not given.',
}

const evidenceFolderNameFlag: FlagSpec = {
  name: 'name',
  type: 'option',
  required: true,
  summary: 'Folder name, sent as the required "name" body field.',
}

const parentIdBodyFlag: FlagSpec = {
  name: 'parent-id',
  type: 'option',
  required: false,
  summary:
    'Parent folder identifier (UUID) from `evidence-folder list`, sent as the ' +
    '"parentId" body field. Omitted from the body when not given. The ' +
    'documented folder operation treats a null parent as the root; the ' +
    'documented evidence operation states no rule for a null parent.',
}

const dataTypeIdArg: ArgSpec = {
  name: 'id',
  type: 'integer',
  required: true,
  summary: 'Integer data type identifier, substituted into the documented request path.',
}

const facilityIdArg: ArgSpec = {
  name: 'id',
  type: 'integer',
  required: true,
  summary: 'Integer facility identifier, substituted into the documented request path.',
}

const interconnectionIdArg: ArgSpec = {
  name: 'id',
  type: 'integer',
  required: true,
  summary: 'Integer interconnection identifier, substituted into the documented request path.',
}

const personnelIdArg: ArgSpec = {
  name: 'id',
  type: 'integer',
  required: true,
  summary: 'Integer personnel identifier, substituted into the documented request path.',
}

const evidenceIdArg: ArgSpec = {
  name: 'id',
  type: 'string',
  required: true,
  summary: 'Evidence identifier (UUID), substituted into the documented request path.',
}

const assessmentObjectiveIdArg: ArgSpec = {
  name: 'id',
  type: 'string',
  required: true,
  summary: 'Assessment objective identifier (UUID), substituted into the documented request path.',
}

const controlIdArg: ArgSpec = {
  name: 'id',
  type: 'string',
  required: true,
  summary: 'Control identifier (UUID), substituted into the documented request path.',
}

const iclVersionIdFlag: FlagSpec = {
  name: 'icl-version-id',
  type: 'option',
  required: true,
  summary:
    'Intelligent Control Library version identifier (UUID), substituted ' +
    'into the documented request path.',
}

/**
 * Shared flag literals for the data-type write commands. The three level
 * flags carry integer identifiers from the matching `lookup data-type ...`
 * command; the CLI validates that each is an integer but never checks it
 * against the lookup catalog.
 */
const dataTypeNameFlag: FlagSpec = {
  name: 'name',
  type: 'option',
  required: true,
  summary: 'Data type name, sent as the required "name" body field.',
}

const dataTypeDescriptionFlag: FlagSpec = {
  name: 'description',
  type: 'option',
  required: false,
  summary:
    'Optional data type description, sent as the "description" body field. ' +
    'Omitted from the body when not given.',
}

const confidentialityIdFlag: FlagSpec = {
  name: 'confidentiality-id',
  type: 'option',
  required: true,
  summary:
    'Integer confidentiality level identifier from ' +
    '`lookup data-type confidentiality-levels`, sent as the required ' +
    '"confidentialityId" body field.',
}

const integrityIdFlag: FlagSpec = {
  name: 'integrity-id',
  type: 'option',
  required: true,
  summary:
    'Integer integrity level identifier from ' +
    '`lookup data-type integrity-levels`, sent as the required ' +
    '"integrityId" body field.',
}

const availabilityIdFlag: FlagSpec = {
  name: 'availability-id',
  type: 'option',
  required: true,
  summary:
    'Integer availability level identifier from ' +
    '`lookup data-type availability-levels`, sent as the required ' +
    '"availabilityId" body field.',
}

const yesFlag: FlagSpec = {
  name: 'yes',
  type: 'boolean',
  required: false,
  summary: 'Skip the delete confirmation prompt and delete without pausing.',
}

/**
 * The repeatable data-type identifier flag shared by the facility and
 * interconnection association commands. The user supplies it once per data
 * type to associate; every value becomes one element of the documented
 * `dataTypeIds` array body field. Omitting the flag sends an empty array,
 * which the documented operations treat as "clear all associations". The CLI
 * validates each value as an integer but never checks it against a lookup
 * catalog.
 */
const dataTypeIdFlag: FlagSpec = {
  name: 'data-type-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer data type identifier to associate. Repeat the flag to associate ' +
    'more than one, for example --data-type-id 1 --data-type-id 2. Each value ' +
    'becomes one element of the "dataTypeIds" array body field. Omit the flag ' +
    'to clear every association.',
}

/**
 * The repeatable assessment-objective identifier flag for the evidence
 * association command. The user supplies it once per objective to map; every
 * value becomes one element of the documented `assessmentObjectiveIds` array
 * body field. The documented DTO marks that field required, so this flag is
 * required: oclif enforces at least one value. Each value is a documented
 * UUID, unlike the integer identifiers of the data-type association flag.
 */
const assessmentObjectiveIdSetFlag: FlagSpec = {
  name: 'assessment-objective-id',
  type: 'option',
  required: true,
  multiple: true,
  summary:
    'Assessment objective identifier (UUID) to map to the evidence. Repeat the ' +
    'flag to map more than one, for example --assessment-objective-id <uuid> ' +
    '--assessment-objective-id <uuid>. Each value becomes one element of the ' +
    'required "assessmentObjectiveIds" array body field.',
}

/**
 * The optional preserve-existing flag for the evidence association command.
 * The documented preserveExisting query parameter defaults to false, which
 * replaces every existing mapping; true adds the given objectives to the
 * existing mappings. Omitting the flag applies the documented default.
 */
const preserveExistingFlag: FlagSpec = {
  name: 'preserve-existing',
  type: 'option',
  required: false,
  allowedValues: ['true', 'false'],
  summary:
    'Explicit true or false, sent as the documented preserveExisting query ' +
    'parameter. true adds the given objectives to the existing mappings; ' +
    'omit the flag or pass false to replace all existing mappings (the ' +
    'documented default).',
}

/**
 * Flag literals for the assessment-objective update command. The documented
 * AssessmentObjectiveUpdateDTO marks every field optional and nullable, so
 * each flag is optional and its field is sent only when the flag is supplied.
 * The two identifier flags carry integers; the four detail flags carry text.
 */
const updateEvaluationIdFlag: FlagSpec = {
  name: 'evaluation-id',
  type: 'option',
  required: false,
  summary:
    'Integer evaluation identifier, sent as the optional "evaluationId" body ' +
    'field. Omitted from the body when not given.',
}

const updateStatusIdFlag: FlagSpec = {
  name: 'status-id',
  type: 'option',
  required: false,
  summary:
    'Integer status identifier from `lookup assessment-objective statuses`, ' +
    'sent as the optional "statusId" body field. Omitted from the body when ' +
    'not given.',
}

const implementationDetailFlag: FlagSpec = {
  name: 'implementation-detail',
  type: 'option',
  required: false,
  summary:
    'Implementation detail text, sent as the optional "implementationDetail" ' +
    'body field. Omitted from the body when not given.',
}

const findingDetailFlag: FlagSpec = {
  name: 'finding-detail',
  type: 'option',
  required: false,
  summary:
    'Finding detail text, sent as the optional "findingDetail" body field. ' +
    'Omitted from the body when not given.',
}

const recommendationDetailFlag: FlagSpec = {
  name: 'recommendation-detail',
  type: 'option',
  required: false,
  summary:
    'Recommendation detail text, sent as the optional "recommendationDetail" ' +
    'body field. Omitted from the body when not given.',
}

const validationMethodsFlag: FlagSpec = {
  name: 'validation-methods',
  type: 'option',
  required: false,
  summary:
    'Validation methods text, sent as the optional "validationMethods" body ' +
    'field. The documented field is a single string, not a list. Omitted from ' +
    'the body when not given.',
}

/**
 * Flag literal for the control update command. The documented ControlUpdateDTO
 * marks both fields optional and nullable, so this is a partial update. The
 * `--evaluation-id` field reuses the shared updateEvaluationIdFlag; this flag
 * supplies the free-text summary statement. The documented controlId path
 * parameter is a UUID, supplied by the shared id argument (controlIdArg below).
 */
const summaryStatementFlag: FlagSpec = {
  name: 'summary-statement',
  type: 'option',
  required: false,
  summary:
    'Summary statement (implementation detail) text, sent as the optional ' +
    '"summaryStatement" body field. Omitted from the body when not given.',
}

/**
 * Flag literals for the interconnection create and update commands. The two
 * documented DTOs differ in what they require: InterconnectionCreateDTO marks
 * `name`, `authorizingOfficialId`, and `authorizationTypes` required;
 * InterconnectionUpdateDTO marks only `name` required. So the two commands
 * share the name, provider, and description flags but use separate
 * authorizing-official-id and authorization-type flags with the matching
 * required status. The contract suite checks each flag's required status
 * against its own DTO's required set.
 */
const interconnectionNameFlag: FlagSpec = {
  name: 'name',
  type: 'option',
  required: true,
  summary: 'Interconnection name, sent as the required "name" body field.',
}

const interconnectionProviderFlag: FlagSpec = {
  name: 'provider',
  type: 'option',
  required: false,
  summary:
    'Optional interconnection provider, sent as the "provider" body field. ' +
    'Omitted from the body when not given.',
}

const interconnectionDescriptionFlag: FlagSpec = {
  name: 'description',
  type: 'option',
  required: false,
  summary:
    'Optional interconnection description, sent as the "description" body ' +
    'field. Omitted from the body when not given.',
}

const createAuthorizingOfficialIdFlag: FlagSpec = {
  name: 'authorizing-official-id',
  type: 'option',
  required: true,
  summary:
    'Integer personnel identifier of the authorizing official from ' +
    '`personnel list`, sent as the required "authorizingOfficialId" body field.',
}

const updateAuthorizingOfficialIdFlag: FlagSpec = {
  name: 'authorizing-official-id',
  type: 'option',
  required: false,
  summary:
    'Integer personnel identifier of the authorizing official from ' +
    '`personnel list`, sent as the optional "authorizingOfficialId" body ' +
    'field. Omitted from the body when not given.',
}

const createAuthorizationTypeFlag: FlagSpec = {
  name: 'authorization-type',
  type: 'option',
  required: true,
  multiple: true,
  summary:
    'One authorization type to associate, written as comma-separated ' +
    'key=value pairs: id=<integer> for the required ' +
    'interconnectionAuthorizationTypeId (from ' +
    '`lookup interconnection authorization-types`), and an optional ' +
    'other=<text> for the otherValue field. Repeat the flag to associate ' +
    'more than one, for example --authorization-type id=5 ' +
    '--authorization-type id=7,other="Site-to-site VPN". Every occurrence ' +
    'becomes one element of the required "authorizationTypes" array body field.',
}

const updateAuthorizationTypeFlag: FlagSpec = {
  name: 'authorization-type',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'One authorization type to associate, written as comma-separated ' +
    'key=value pairs: id=<integer> for the required ' +
    'interconnectionAuthorizationTypeId (from ' +
    '`lookup interconnection authorization-types`), and an optional ' +
    'other=<text> for the otherValue field. Repeat the flag to associate ' +
    'more than one. Providing this flag replaces all existing authorization ' +
    'type associations. The archived contract does not state what the update ' +
    'operation does when the flag is absent, so send the full list you want ' +
    'to keep.',
}

/**
 * Flag list for the facility create and update commands. The documented
 * FacilityCreateDTO and FacilityUpdateDTO carry the same fourteen scalar field
 * names, types, and formats, and both mark only `name` required, so both
 * commands share one flag list. Every field is scalar, so no flag is
 * repeatable. `locationTypeId`, `employeeCount`, and `primaryContactId` are
 * documented int32 integers; every other field is a documented string. An
 * omitted optional flag leaves its field out of the request body.
 *
 * The two DTOs are not identical: the create DTO documents three string
 * constraints that the update DTO does not — `state` has maxLength 2,
 * `zipCode` has the pattern ^\d{5}(-\d{4})?$, and `website` has the `uri`
 * format. Each summary below names the create DTO when it states one of those
 * constraints, because the same flag also serves the update command, whose
 * documented schema does not carry the constraint. The CLI enforces none of
 * the three: the IntelliGRC API is the authority that accepts or rejects a
 * value, exactly as it is for the identifier flags.
 */
const facilityWriteFlags: FlagSpec[] = [
  {
    name: 'name',
    type: 'option',
    required: true,
    summary: 'Facility name, sent as the required "name" body field.',
  },
  {
    name: 'description',
    type: 'option',
    required: false,
    summary:
      'Optional facility description, sent as the "description" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'location-type-id',
    type: 'option',
    required: false,
    summary:
      'Integer facility type identifier from `lookup facility types`, sent as ' +
      'the "locationTypeId" body field. Omitted from the body when not given.',
  },
  {
    name: 'address',
    type: 'option',
    required: false,
    summary:
      'Optional street address, sent as the "address" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'address-line2',
    type: 'option',
    required: false,
    summary:
      'Optional second address line, sent as the "addressLine2" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'city',
    type: 'option',
    required: false,
    summary: 'Optional city, sent as the "city" body field. Omitted from the body when not given.',
  },
  {
    name: 'state',
    type: 'option',
    required: false,
    summary:
      'Optional state, sent as the "state" body field. The documented create ' +
      'field holds at most two characters, for example TX. Omitted from the ' +
      'body when not given.',
  },
  {
    name: 'zip-code',
    type: 'option',
    required: false,
    summary:
      'Optional postal code, sent as the "zipCode" body field. The documented ' +
      'create field holds five digits or five-plus-four digits, for example ' +
      '78701 or 78701-1234. Omitted from the body when not given.',
  },
  {
    name: 'country',
    type: 'option',
    required: false,
    summary:
      'Optional country, sent as the "country" body field. Omitted from the ' +
      'body when not given.',
  },
  {
    name: 'phone-number',
    type: 'option',
    required: false,
    summary:
      'Optional telephone number, sent as the "phoneNumber" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'website',
    type: 'option',
    required: false,
    summary:
      'Optional website address, sent as the "website" body field. The ' +
      'documented create field holds a uniform resource identifier (URI), for ' +
      'example https://example.com. Omitted from the body when not given.',
  },
  {
    name: 'fax-number',
    type: 'option',
    required: false,
    summary:
      'Optional fax number, sent as the "faxNumber" body field. Omitted from ' +
      'the body when not given.',
  },
  {
    name: 'employee-count',
    type: 'option',
    required: false,
    summary:
      'Integer number of employees at the facility, sent as the ' +
      '"employeeCount" body field. Omitted from the body when not given.',
  },
  {
    name: 'primary-contact-id',
    type: 'option',
    required: false,
    summary:
      'Integer personnel identifier of the primary contact from ' +
      '`personnel list`, sent as the "primaryContactId" body field. Omitted ' +
      'from the body when not given.',
  },
]

/**
 * Flag list for the personnel create and update commands. The documented
 * PersonnelCreateDTO and PersonnelUpdateDTO carry the same twelve scalar field
 * names, types, and formats, and both mark `firstName` and `lastName`
 * required, so both commands share one flag list. Every field is scalar, so no
 * flag is repeatable. `userTypeId` is a documented int32 integer; every other
 * field is a documented string. An omitted optional flag leaves its field out
 * of the request body.
 *
 * `--department-cd` supplies the documented `department_CD` body field. The
 * flag name follows the CLI's lowercase, hyphenated convention; the body field
 * keeps the documented name, underscore and capitals included.
 */
const personnelWriteFlags: FlagSpec[] = [
  {
    name: 'first-name',
    type: 'option',
    required: true,
    summary: 'Given name, sent as the required "firstName" body field.',
  },
  {
    name: 'last-name',
    type: 'option',
    required: true,
    summary: 'Family name, sent as the required "lastName" body field.',
  },
  {
    name: 'middle-name',
    type: 'option',
    required: false,
    summary:
      'Optional middle name, sent as the "middleName" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'title',
    type: 'option',
    required: false,
    summary:
      'Optional job title, sent as the "title" body field. Omitted from the ' +
      'body when not given.',
  },
  {
    name: 'description',
    type: 'option',
    required: false,
    summary:
      'Optional description of the person, sent as the "description" body ' +
      'field. Omitted from the body when not given.',
  },
  {
    name: 'email-address',
    type: 'option',
    required: false,
    summary:
      'Optional email address, sent as the "emailAddress" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'phone-number',
    type: 'option',
    required: false,
    summary:
      'Optional telephone number, sent as the "phoneNumber" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'office-number',
    type: 'option',
    required: false,
    summary:
      'Optional office number, sent as the "officeNumber" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'network-user-name',
    type: 'option',
    required: false,
    summary:
      'Optional network user name, sent as the "networkUserName" body field. ' +
      'Omitted from the body when not given.',
  },
  {
    name: 'department-cd',
    type: 'option',
    required: false,
    summary:
      'Optional department code, sent as the documented "department_CD" body ' +
      'field. Omitted from the body when not given.',
  },
  {
    name: 'ad-domain',
    type: 'option',
    required: false,
    summary:
      'Optional directory domain, sent as the "adDomain" body field. Omitted ' +
      'from the body when not given.',
  },
  {
    name: 'user-type-id',
    type: 'option',
    required: false,
    summary:
      'Integer user type identifier, sent as the "userTypeId" body field. The ' +
      'archived contract documents no lookup operation for the user type ' +
      'options. Omitted from the body when not given.',
  },
]

/**
 * Flag literals for the evaluation create command. The documented
 * EvaluationCreateDTO marks `name`, `reason`, `boundaryId`, `startDate`,
 * `endDate`, `iclVersionId`, and `frameworkIds` required; `totalBudget`,
 * `targetType`, and `previousEvaluationId` are optional. The date flags carry
 * a calendar date that the CLI sends as the documented date-time field at
 * midnight UTC. Note that `targetType` is a documented int32 integer, not
 * free text.
 */
const evaluationNameFlag: FlagSpec = {
  name: 'name',
  type: 'option',
  required: true,
  summary: 'Evaluation name, sent as the required "name" body field.',
}

const evaluationReasonFlag: FlagSpec = {
  name: 'reason',
  type: 'option',
  required: true,
  summary: 'Reason for the evaluation, sent as the required "reason" body field.',
}

const boundaryIdBodyFlag: FlagSpec = {
  name: 'boundary-id',
  type: 'option',
  required: true,
  summary:
    'Integer boundary identifier from `boundary list`, sent as the required ' +
    '"boundaryId" body field.',
}

const startDateFlag: FlagSpec = {
  name: 'start-date',
  type: 'option',
  required: true,
  summary:
    'Evaluation start date in YYYY-MM-DD form, sent as the required ' +
    '"startDate" date-time body field at midnight UTC.',
}

const endDateFlag: FlagSpec = {
  name: 'end-date',
  type: 'option',
  required: true,
  summary:
    'Evaluation end date in YYYY-MM-DD form, sent as the required "endDate" ' +
    'date-time body field at midnight UTC.',
}

const totalBudgetFlag: FlagSpec = {
  name: 'total-budget',
  type: 'option',
  required: false,
  summary:
    'Optional total budget number (for example 50000 or 50000.50), sent as ' +
    'the "totalBudget" body field. Omitted from the body when not given.',
}

const evaluationIclVersionIdFlag: FlagSpec = {
  name: 'icl-version-id',
  type: 'option',
  required: true,
  summary:
    'Intelligent Control Library version identifier (UUID) from ' +
    '`lookup icl-version list`, sent as the required "iclVersionId" body field.',
}

const evaluationFrameworkIdFlag: FlagSpec = {
  name: 'framework-id',
  type: 'option',
  required: true,
  multiple: true,
  summary:
    'Framework identifier (UUID) to assess, from ' +
    '`lookup icl-version frameworks`. Repeat the flag to assess more than one, ' +
    'for example --framework-id <uuid> --framework-id <uuid>. Each value ' +
    'becomes one element of the required "frameworkIds" array body field.',
}

const targetTypeFlag: FlagSpec = {
  name: 'target-type',
  type: 'option',
  required: false,
  summary:
    'Optional integer target type identifier, sent as the "targetType" body ' +
    'field. The documented field is an integer, not free text. Omitted from ' +
    'the body when not given.',
}

const previousEvaluationIdFlag: FlagSpec = {
  name: 'previous-evaluation-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer identifier of the previous evaluation, sent as the ' +
    '"previousEvaluationId" body field. Omitted from the body when not given.',
}

/**
 * Flag literals for the boundary create command. The documented
 * BoundaryCreateDTO is the largest write body: four required scalar fields,
 * twelve optional scalar fields, and eight optional array fields whose item
 * types differ (six int32 id arrays, one UUID array, and one plain string
 * array). Each optional flag omits its field from the body when not given;
 * each array flag is repeatable and contributes one array element per
 * occurrence.
 */
const boundaryNameFlag: FlagSpec = {
  name: 'name',
  type: 'option',
  required: true,
  summary: 'Boundary name, sent as the required "name" body field.',
}

const uniqueIdentifierFlag: FlagSpec = {
  name: 'unique-identifier',
  type: 'option',
  required: true,
  summary:
    'Boundary unique identifier, sent as the required "uniqueIdentifier" body field.',
}

const operationalStatusIdFlag: FlagSpec = {
  name: 'operational-status-id',
  type: 'option',
  required: true,
  summary:
    'Integer operational status identifier from ' +
    '`lookup boundary operational-statuses`, sent as the required ' +
    '"operationalStatusId" body field.',
}

const systemTypeIdFlag: FlagSpec = {
  name: 'system-type-id',
  type: 'option',
  required: true,
  summary:
    'Integer system type identifier, sent as the required "systemTypeId" body field.',
}

const boundaryDescriptionFlag: FlagSpec = {
  name: 'description',
  type: 'option',
  required: false,
  summary:
    'Optional boundary description, sent as the "description" body field. ' +
    'Omitted from the body when not given.',
}

const systemEnvironmentFlag: FlagSpec = {
  name: 'system-environment',
  type: 'option',
  required: false,
  summary:
    'Optional system environment, sent as the "systemEnvironment" body field. ' +
    'Omitted from the body when not given.',
}

const networkArchitectureDetailsFlag: FlagSpec = {
  name: 'network-architecture-details',
  type: 'option',
  required: false,
  summary:
    'Optional network architecture details, sent as the ' +
    '"networkArchitectureDetails" body field. Omitted from the body when not given.',
}

const operationalStatusDetailsFlag: FlagSpec = {
  name: 'operational-status-details',
  type: 'option',
  required: false,
  summary:
    'Optional operational status details, sent as the ' +
    '"operationalStatusDetails" body field. Omitted from the body when not given.',
}

const informationSystemTypeIdFlag: FlagSpec = {
  name: 'information-system-type-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer information system type identifier from ' +
    '`lookup boundary information-system-types`, sent as the ' +
    '"informationSystemTypeId" body field. Omitted from the body when not given.',
}

const informationSystemTypeDetailsFlag: FlagSpec = {
  name: 'information-system-type-details',
  type: 'option',
  required: false,
  summary:
    'Optional information system type details, sent as the ' +
    '"informationSystemTypeDetails" body field. Omitted from the body when not given.',
}

const boundaryConfidentialityIdFlag: FlagSpec = {
  name: 'confidentiality-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer confidentiality level identifier from ' +
    '`lookup boundary confidentiality-levels`, sent as the "confidentialityId" ' +
    'body field. Omitted from the body when not given.',
}

const boundaryIntegrityIdFlag: FlagSpec = {
  name: 'integrity-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer integrity level identifier from ' +
    '`lookup boundary integrity-levels`, sent as the "integrityId" body field. ' +
    'Omitted from the body when not given.',
}

const boundaryAvailabilityIdFlag: FlagSpec = {
  name: 'availability-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer availability level identifier from ' +
    '`lookup boundary availability-levels`, sent as the "availabilityId" body ' +
    'field. Omitted from the body when not given.',
}

const securityCategoryIdFlag: FlagSpec = {
  name: 'security-category-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer security category identifier, sent as the ' +
    '"securityCategoryId" body field. Omitted from the body when not given.',
}

const networkDiagramIdFlag: FlagSpec = {
  name: 'network-diagram-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer network diagram identifier, sent as the ' +
    '"networkDiagramId" body field. Omitted from the body when not given.',
}

const dataFlowDiagramIdFlag: FlagSpec = {
  name: 'data-flow-diagram-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer data flow diagram identifier, sent as the ' +
    '"dataFlowDiagramId" body field. Omitted from the body when not given.',
}

const deviceIdFlag: FlagSpec = {
  name: 'device-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer device identifier to associate. Repeat the flag to associate more ' +
    'than one. Each value becomes one element of the "deviceIds" array body ' +
    'field. Omitted from the body when not given.',
}

const locationIdFlag: FlagSpec = {
  name: 'location-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer location identifier to associate. Repeat the flag to associate ' +
    'more than one. Each value becomes one element of the "locationIds" array ' +
    'body field. Omitted from the body when not given.',
}

const sensitiveInformationTypeIdFlag: FlagSpec = {
  name: 'sensitive-information-type-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer sensitive information type identifier to associate. Repeat the ' +
    'flag to associate more than one. Each value becomes one element of the ' +
    '"sensitiveInformationTypeIds" array body field. Omitted from the body when ' +
    'not given.',
}

const boundaryInterconnectionIdFlag: FlagSpec = {
  name: 'interconnection-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer interconnection identifier to associate. Repeat the flag to ' +
    'associate more than one. Each value becomes one element of the ' +
    '"interconnectionIds" array body field. Omitted from the body when not given.',
}

const lawRegulationPolicyIdFlag: FlagSpec = {
  name: 'law-regulation-policy-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer law, regulation, or policy identifier to associate. Repeat the ' +
    'flag to associate more than one. Each value becomes one element of the ' +
    '"lawRegulationPolicyIds" array body field. Omitted from the body when not given.',
}

const boundaryPersonnelIdFlag: FlagSpec = {
  name: 'personnel-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer personnel identifier to associate. Repeat the flag to associate ' +
    'more than one. Each value becomes one element of the "personnelIds" array ' +
    'body field. Omitted from the body when not given.',
}

const boundaryFrameworkIdFlag: FlagSpec = {
  name: 'framework-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Framework identifier (UUID) to associate, from ' +
    '`lookup icl-version frameworks`. Repeat the flag to associate more than ' +
    'one. Each value becomes one element of the "frameworkIds" array body field. ' +
    'Omitted from the body when not given.',
}

const cageCodeFlag: FlagSpec = {
  name: 'cage-code',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Commercial and Government Entity (CAGE) code to associate. Repeat the flag ' +
    'to associate more than one. Each value becomes one element of the ' +
    '"cageCodes" array body field. Omitted from the body when not given.',
}

/**
 * Flag literals for the three Action Plan create commands (project, task,
 * subtask). The three documented DTOs share many optional fields, so the shared
 * literals below are reused across the command specs; the required-field
 * literals differ per command (each status flag points to a different status
 * lookup). Each optional flag omits its field from the body when not given;
 * each `assigned*` flag is repeatable and contributes one array element per
 * occurrence.
 */
const apNameFlag: FlagSpec = {
  name: 'name',
  type: 'option',
  required: true,
  summary: 'Name, sent as the required "name" body field.',
}

const apDescriptionFlag: FlagSpec = {
  name: 'description',
  type: 'option',
  required: true,
  summary: 'Description, sent as the required "description" body field.',
}

const apProjectStatusIdFlag: FlagSpec = {
  name: 'status-id',
  type: 'option',
  required: true,
  summary:
    'Integer status identifier from `lookup action-plan project-statuses`, sent ' +
    'as the required "statusId" body field.',
}

const apTaskStatusIdFlag: FlagSpec = {
  name: 'status-id',
  type: 'option',
  required: true,
  summary:
    'Integer status identifier from `lookup action-plan task-statuses`, sent as ' +
    'the required "statusId" body field.',
}

const apSubTaskStatusIdFlag: FlagSpec = {
  name: 'status-id',
  type: 'option',
  required: true,
  summary:
    'Integer status identifier from `lookup action-plan subtask-statuses`, sent ' +
    'as the required "statusId" body field.',
}

const taskTypeIdFlag: FlagSpec = {
  name: 'task-type-id',
  type: 'option',
  required: true,
  summary:
    'Integer task type identifier from `lookup action-plan task-types`, sent as ' +
    'the required "taskTypeId" body field.',
}

const subTaskTitleFlag: FlagSpec = {
  name: 'title',
  type: 'option',
  required: true,
  summary: 'Subtask title, sent as the required "title" body field.',
}

const subTaskTaskIdFlag: FlagSpec = {
  name: 'task-id',
  type: 'option',
  required: true,
  summary:
    'Task identifier (UUID) from `action-plan-task list`, sent as the required ' +
    '"taskId" body field.',
}

const costEstimateFlag: FlagSpec = {
  name: 'cost-estimate',
  type: 'option',
  required: false,
  summary:
    'Optional cost estimate number (for example 50000 or 50000.50), sent as the ' +
    '"costEstimate" body field. Omitted from the body when not given.',
}

const dueDateFlag: FlagSpec = {
  name: 'due-date',
  type: 'option',
  required: false,
  summary:
    'Optional due date in YYYY-MM-DD form, sent as the "dueDate" date-time body ' +
    'field at midnight UTC. Omitted from the body when not given.',
}

const budgetFlag: FlagSpec = {
  name: 'budget',
  type: 'option',
  required: false,
  summary:
    'Optional budget number (for example 50000 or 50000.50), sent as the ' +
    '"budget" body field. Omitted from the body when not given.',
}

const scheduledCompletionDateFlag: FlagSpec = {
  name: 'scheduled-completion-date',
  type: 'option',
  required: false,
  summary:
    'Optional scheduled completion date in YYYY-MM-DD form, sent as the ' +
    '"scheduledCompletionDate" date-time body field at midnight UTC. Omitted ' +
    'from the body when not given.',
}

const projectIdFlag: FlagSpec = {
  name: 'project-id',
  type: 'option',
  required: false,
  summary:
    'Optional project identifier (UUID) from `action-plan-project list`, sent as ' +
    'the "projectId" body field. Omitted from the body when not given.',
}

const actionPlanEvaluationIdFlag: FlagSpec = {
  name: 'evaluation-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer evaluation identifier, sent as the "evaluationId" body ' +
    'field. Omitted from the body when not given.',
}

const levelOfEffortIdFlag: FlagSpec = {
  name: 'level-of-effort-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer level of effort identifier from ' +
    '`lookup action-plan levels-of-effort`, sent as the "levelOfEffortId" body ' +
    'field. Omitted from the body when not given.',
}

const priorityLevelIdFlag: FlagSpec = {
  name: 'priority-level-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer priority level identifier from ' +
    '`lookup action-plan priority-levels`, sent as the "priorityLevelId" body ' +
    'field. Omitted from the body when not given.',
}

const subCategoryIdFlag: FlagSpec = {
  name: 'sub-category-id',
  type: 'option',
  required: false,
  summary:
    'Optional integer subcategory identifier from ' +
    '`lookup action-plan subcategories`, sent as the "subCategoryId" body field. ' +
    'Omitted from the body when not given.',
}

const assignedDepartmentIdFlag: FlagSpec = {
  name: 'assigned-department-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer department identifier to assign. Repeat the flag to assign more ' +
    'than one. Each value becomes one element of the "assignedDepartmentIds" ' +
    'array body field. Omitted from the body when not given.',
}

const assignedPersonnelIdFlag: FlagSpec = {
  name: 'assigned-personnel-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer personnel identifier to assign. Repeat the flag to assign more than ' +
    'one. Each value becomes one element of the "assignedPersonnelIds" array ' +
    'body field. Omitted from the body when not given.',
}

const assignedWatcherIdFlag: FlagSpec = {
  name: 'assigned-watcher-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Integer watcher personnel identifier to assign. Repeat the flag to assign ' +
    'more than one. Each value becomes one element of the "assignedWatcherIds" ' +
    'array body field. Omitted from the body when not given.',
}

const assignedAssessmentObjectiveIdFlag: FlagSpec = {
  name: 'assigned-assessment-objective-id',
  type: 'option',
  required: false,
  multiple: true,
  summary:
    'Assessment objective identifier (UUID) to assign. Repeat the flag to assign ' +
    'more than one. Each value becomes one element of the ' +
    '"assignedAssessmentObjectiveIds" array body field. Omitted from the body ' +
    'when not given.',
}

const isAssignedToOrganizationFlag: FlagSpec = {
  name: 'is-assigned-to-organization',
  type: 'option',
  required: false,
  allowedValues: ['true', 'false'],
  summary:
    'Optional true or false, sent as the "isAssignedToOrganization" body field. ' +
    'Omitted from the body when not given.',
}

const assignedExternalOrganizationFlag: FlagSpec = {
  name: 'assigned-external-organization',
  type: 'option',
  required: false,
  summary:
    'Optional external organization name, sent as the ' +
    '"assignedExternalOrganization" body field. Omitted from the body when not given.',
}

/**
 * Shared parameter contracts. One literal per documented parameter shape
 * keeps the documented facts identical across the command specs, exactly
 * like the shared flag literals above.
 */
const evaluationIdParameter: ParameterContract = {
  name: 'evaluationId',
  in: 'query',
  required: false,
  type: 'integer',
  format: 'int32',
  source: {kind: 'flag', name: 'evaluation-id'},
}

const frameworkIdParameter: ParameterContract = {
  name: 'frameworkId',
  in: 'query',
  required: false,
  type: 'string',
  format: 'uuid',
  source: {kind: 'flag', name: 'framework-id'},
}

const includeTasksParameter: ParameterContract = {
  name: 'includeTasks',
  in: 'query',
  required: false,
  type: 'boolean',
  default: true,
  source: {kind: 'flag', name: 'include-tasks'},
}

const includeSubTasksParameter: ParameterContract = {
  name: 'includeSubTasks',
  in: 'query',
  required: false,
  type: 'boolean',
  default: true,
  source: {kind: 'flag', name: 'include-subtasks'},
}

const assessmentObjectiveIdParameter: ParameterContract = {
  name: 'assessmentObjectiveId',
  in: 'query',
  required: true,
  type: 'string',
  format: 'uuid',
  source: {kind: 'flag', name: 'assessment-objective-id'},
}

const parentIdParameter: ParameterContract = {
  name: 'parentId',
  in: 'query',
  required: false,
  type: 'string',
  format: 'uuid',
  source: {kind: 'flag', name: 'parent-id'},
}

const idPathParameter: ParameterContract = {
  name: 'id',
  in: 'path',
  required: true,
  type: 'integer',
  format: 'int32',
  source: {kind: 'arg', name: 'id'},
}

const evidenceIdPathParameter: ParameterContract = {
  name: 'id',
  in: 'path',
  required: true,
  type: 'string',
  format: 'uuid',
  source: {kind: 'arg', name: 'id'},
}

const assessmentObjectiveIdPathParameter: ParameterContract = {
  name: 'id',
  in: 'path',
  required: true,
  type: 'string',
  format: 'uuid',
  source: {kind: 'arg', name: 'id'},
}

/**
 * The documented controlId path parameter of PUT /v1/Controls/{controlId}. It
 * is a UUID, not an integer, and its documented name is "controlId" rather than
 * the "id" used by the other write paths, so it records its own name while
 * reusing the shared id argument as its source.
 */
const controlIdPathParameter: ParameterContract = {
  name: 'controlId',
  in: 'path',
  required: true,
  type: 'string',
  format: 'uuid',
  source: {kind: 'arg', name: 'id'},
}

const preserveExistingParameter: ParameterContract = {
  name: 'preserveExisting',
  in: 'query',
  required: false,
  type: 'boolean',
  default: false,
  source: {kind: 'flag', name: 'preserve-existing'},
}

const iclVersionIdParameter: ParameterContract = {
  name: 'iclVersionId',
  in: 'path',
  required: true,
  type: 'string',
  format: 'uuid',
  source: {kind: 'flag', name: 'icl-version-id'},
}

/**
 * The documented DataTypeCreateDTO and DataTypeUpdateDTO share this body
 * field contract. Each field copies the archived DTO schema verbatim and
 * names the flag that supplies it.
 */
const dataTypeBodyFields: RequestBodyFieldContract[] = [
  {name: 'name', type: 'string', required: true, source: {kind: 'flag', name: 'name'}},
  {
    name: 'description',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'description'},
  },
  {
    name: 'confidentialityId',
    type: 'integer',
    format: 'int32',
    required: true,
    source: {kind: 'flag', name: 'confidentiality-id'},
  },
  {
    name: 'integrityId',
    type: 'integer',
    format: 'int32',
    required: true,
    source: {kind: 'flag', name: 'integrity-id'},
  },
  {
    name: 'availabilityId',
    type: 'integer',
    format: 'int32',
    required: true,
    source: {kind: 'flag', name: 'availability-id'},
  },
]

/**
 * The documented FacilityDataTypesUpdateDTO and InterconnectionDataTypesUpdateDTO
 * share this body field contract: one nullable array of int32 identifiers
 * named `dataTypeIds`, supplied by the repeatable --data-type-id flag. The
 * contract suite compares the array item type against the archived DTO
 * exactly as it compares a scalar field.
 */
const dataTypeIdsBodyFields: RequestBodyFieldContract[] = [
  {
    name: 'dataTypeIds',
    type: 'array',
    items: {type: 'integer', format: 'int32'},
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'data-type-id'},
  },
]

/**
 * The documented EvidenceAssessmentObjectivesUpdateDTO body field contract:
 * one required array of UUID identifiers named `assessmentObjectiveIds`,
 * supplied by the repeatable --assessment-objective-id flag. The DTO marks the
 * field required and does not mark it nullable, so this differs from the
 * data-type association body, whose array is optional and nullable. The
 * contract suite compares the array item type (string/uuid) against the
 * archived DTO exactly as it compares a scalar field.
 */
const assessmentObjectiveIdsBodyFields: RequestBodyFieldContract[] = [
  {
    name: 'assessmentObjectiveIds',
    type: 'array',
    items: {type: 'string', format: 'uuid'},
    required: true,
    source: {kind: 'flag', name: 'assessment-objective-id'},
  },
]

/**
 * The documented AssessmentObjectiveUpdateDTO body field contract. Every
 * field is optional and nullable in the archived DTO (the schema lists no
 * required set), so the update is partial: each flag supplies its field only
 * when given. `validationMethods` is a single string, not an array, so it
 * records no item schema. Each field copies the archived DTO schema verbatim
 * and names the flag that supplies it.
 */
const assessmentObjectiveUpdateBodyFields: RequestBodyFieldContract[] = [
  {
    name: 'evaluationId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'evaluation-id'},
  },
  {
    name: 'statusId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'status-id'},
  },
  {
    name: 'implementationDetail',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'implementation-detail'},
  },
  {
    name: 'findingDetail',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'finding-detail'},
  },
  {
    name: 'recommendationDetail',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'recommendation-detail'},
  },
  {
    name: 'validationMethods',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'validation-methods'},
  },
]

/**
 * The documented ControlUpdateDTO body field contract. Both fields are optional
 * and nullable in the archived DTO (the schema lists no required set), so the
 * update is partial: each flag supplies its field only when given. `evaluationId`
 * is an int32 integer; `summaryStatement` is a string. Each field copies the
 * archived DTO schema verbatim and names the flag that supplies it.
 */
const controlUpdateBodyFields: RequestBodyFieldContract[] = [
  {
    name: 'evaluationId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'evaluation-id'},
  },
  {
    name: 'summaryStatement',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'summary-statement'},
  },
]

/**
 * The documented InterconnectionAuthorizationTypeInputDTO, the item schema of
 * the `authorizationTypes` array in both the create and update DTOs. It is a
 * nested object with one required int32 field and one optional nullable string
 * field. The contract suite resolves the array item $ref and compares these
 * sub-fields against the archived item DTO exactly as it compares the
 * top-level body fields.
 */
const authorizationTypeItem: RequestBodyItemContract = {
  type: 'object',
  fields: [
    {
      name: 'interconnectionAuthorizationTypeId',
      type: 'integer',
      format: 'int32',
      required: true,
    },
    {name: 'otherValue', type: 'string', required: false, nullable: true},
  ],
}

/**
 * The documented InterconnectionCreateDTO body field contract. The DTO marks
 * `name`, `authorizingOfficialId`, and `authorizationTypes` required;
 * `provider` and `description` are optional and nullable. `authorizationTypes`
 * is an array of the nested authorization-type object, supplied by the
 * repeatable --authorization-type flag.
 */
const interconnectionCreateBodyFields: RequestBodyFieldContract[] = [
  {name: 'name', type: 'string', required: true, source: {kind: 'flag', name: 'name'}},
  {
    name: 'provider',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'provider'},
  },
  {
    name: 'description',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'description'},
  },
  {
    name: 'authorizingOfficialId',
    type: 'integer',
    format: 'int32',
    required: true,
    source: {kind: 'flag', name: 'authorizing-official-id'},
  },
  {
    name: 'authorizationTypes',
    type: 'array',
    items: authorizationTypeItem,
    required: true,
    source: {kind: 'flag', name: 'authorization-type'},
  },
]

/**
 * The documented InterconnectionUpdateDTO body field contract. The DTO marks
 * only `name` required; every other field is optional and nullable, so this is
 * a partial update. `authorizingOfficialId` and `authorizationTypes` are
 * therefore optional and nullable here, unlike the create DTO where they are
 * required. The array item schema is the same nested authorization-type object.
 */
const interconnectionUpdateBodyFields: RequestBodyFieldContract[] = [
  {name: 'name', type: 'string', required: true, source: {kind: 'flag', name: 'name'}},
  {
    name: 'provider',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'provider'},
  },
  {
    name: 'description',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'description'},
  },
  {
    name: 'authorizingOfficialId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'authorizing-official-id'},
  },
  {
    name: 'authorizationTypes',
    type: 'array',
    items: authorizationTypeItem,
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'authorization-type'},
  },
]

/**
 * The documented EvaluationCreateDTO body field contract. Seven fields are
 * required; `totalBudget`, `targetType`, and `previousEvaluationId` are
 * optional. `startDate` and `endDate` are documented date-time strings.
 * `boundaryId`, `targetType`, and `previousEvaluationId` are int32 integers;
 * `totalBudget` is a double number. `frameworkIds` is a required array of UUID
 * strings, supplied by the repeatable --framework-id flag. `targetType` and
 * `previousEvaluationId` are documented nullable.
 */
const evaluationCreateBodyFields: RequestBodyFieldContract[] = [
  {name: 'name', type: 'string', required: true, source: {kind: 'flag', name: 'name'}},
  {name: 'reason', type: 'string', required: true, source: {kind: 'flag', name: 'reason'}},
  {
    name: 'boundaryId',
    type: 'integer',
    format: 'int32',
    required: true,
    source: {kind: 'flag', name: 'boundary-id'},
  },
  {
    name: 'startDate',
    type: 'string',
    format: 'date-time',
    required: true,
    source: {kind: 'flag', name: 'start-date'},
  },
  {
    name: 'endDate',
    type: 'string',
    format: 'date-time',
    required: true,
    source: {kind: 'flag', name: 'end-date'},
  },
  {
    name: 'totalBudget',
    type: 'number',
    format: 'double',
    required: false,
    source: {kind: 'flag', name: 'total-budget'},
  },
  {
    name: 'iclVersionId',
    type: 'string',
    format: 'uuid',
    required: true,
    source: {kind: 'flag', name: 'icl-version-id'},
  },
  {
    name: 'frameworkIds',
    type: 'array',
    items: {type: 'string', format: 'uuid'},
    required: true,
    source: {kind: 'flag', name: 'framework-id'},
  },
  {
    name: 'targetType',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'target-type'},
  },
  {
    name: 'previousEvaluationId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'previous-evaluation-id'},
  },
]

/** A documented int32 array body field, supplied by one repeatable flag. */
function int32ArrayField(name: string, flagName: string): RequestBodyFieldContract {
  return {
    name,
    type: 'array',
    items: {type: 'integer', format: 'int32'},
    required: false,
    nullable: true,
    source: {kind: 'flag', name: flagName},
  }
}

/**
 * The documented BoundaryCreateDTO body field contract. Four fields are
 * required (`name`, `uniqueIdentifier`, `operationalStatusId`, `systemTypeId`);
 * every other field is optional and nullable. The six `*Ids` arrays hold int32
 * items, `frameworkIds` holds UUID strings, and `cageCodes` holds plain
 * strings. Field order follows the archived DTO's property order.
 */
const boundaryCreateBodyFields: RequestBodyFieldContract[] = [
  {name: 'name', type: 'string', required: true, source: {kind: 'flag', name: 'name'}},
  {
    name: 'uniqueIdentifier',
    type: 'string',
    required: true,
    source: {kind: 'flag', name: 'unique-identifier'},
  },
  {
    name: 'description',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'description'},
  },
  {
    name: 'systemEnvironment',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'system-environment'},
  },
  {
    name: 'networkArchitectureDetails',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'network-architecture-details'},
  },
  {
    name: 'operationalStatusId',
    type: 'integer',
    format: 'int32',
    required: true,
    source: {kind: 'flag', name: 'operational-status-id'},
  },
  {
    name: 'operationalStatusDetails',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'operational-status-details'},
  },
  {
    name: 'informationSystemTypeId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'information-system-type-id'},
  },
  {
    name: 'informationSystemTypeDetails',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'information-system-type-details'},
  },
  {
    name: 'confidentialityId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'confidentiality-id'},
  },
  {
    name: 'integrityId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'integrity-id'},
  },
  {
    name: 'availabilityId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'availability-id'},
  },
  {
    name: 'securityCategoryId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'security-category-id'},
  },
  {
    name: 'networkDiagramId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'network-diagram-id'},
  },
  {
    name: 'dataFlowDiagramId',
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'data-flow-diagram-id'},
  },
  {
    name: 'systemTypeId',
    type: 'integer',
    format: 'int32',
    required: true,
    source: {kind: 'flag', name: 'system-type-id'},
  },
  int32ArrayField('deviceIds', 'device-id'),
  int32ArrayField('locationIds', 'location-id'),
  int32ArrayField('sensitiveInformationTypeIds', 'sensitive-information-type-id'),
  int32ArrayField('interconnectionIds', 'interconnection-id'),
  int32ArrayField('lawRegulationPolicyIds', 'law-regulation-policy-id'),
  int32ArrayField('personnelIds', 'personnel-id'),
  {
    name: 'frameworkIds',
    type: 'array',
    items: {type: 'string', format: 'uuid'},
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'framework-id'},
  },
  {
    name: 'cageCodes',
    type: 'array',
    items: {type: 'string'},
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'cage-code'},
  },
]

/** A documented required string body field. */
function requiredStringField(name: string, flagName: string): RequestBodyFieldContract {
  return {name, type: 'string', required: true, source: {kind: 'flag', name: flagName}}
}

/** A documented optional, nullable string body field. */
function optionalStringField(name: string, flagName: string): RequestBodyFieldContract {
  return {name, type: 'string', required: false, nullable: true, source: {kind: 'flag', name: flagName}}
}

/** A documented required int32 body field. */
function requiredIntField(name: string, flagName: string): RequestBodyFieldContract {
  return {name, type: 'integer', format: 'int32', required: true, source: {kind: 'flag', name: flagName}}
}

/** A documented optional, nullable int32 body field. */
function optionalIntField(name: string, flagName: string): RequestBodyFieldContract {
  return {
    name,
    type: 'integer',
    format: 'int32',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: flagName},
  }
}

/** A documented optional, nullable double number body field. */
function optionalNumberField(name: string, flagName: string): RequestBodyFieldContract {
  return {
    name,
    type: 'number',
    format: 'double',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: flagName},
  }
}

/** A documented optional, nullable date-time string body field. */
function optionalDateField(name: string, flagName: string): RequestBodyFieldContract {
  return {
    name,
    type: 'string',
    format: 'date-time',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: flagName},
  }
}

/**
 * The three int32 assignment arrays shared by all three Action Plan create
 * bodies, supplied by the repeatable --assigned-*-id flags.
 */
const actionPlanAssignmentFields: RequestBodyFieldContract[] = [
  int32ArrayField('assignedDepartmentIds', 'assigned-department-id'),
  int32ArrayField('assignedPersonnelIds', 'assigned-personnel-id'),
  int32ArrayField('assignedWatcherIds', 'assigned-watcher-id'),
]

/** The three optional int32 classification fields shared by all three bodies. */
const actionPlanClassificationFields: RequestBodyFieldContract[] = [
  optionalIntField('levelOfEffortId', 'level-of-effort-id'),
  optionalIntField('priorityLevelId', 'priority-level-id'),
  optionalIntField('subCategoryId', 'sub-category-id'),
]

/** The optional organization fields shared by the task and subtask bodies. */
const actionPlanOrganizationFields: RequestBodyFieldContract[] = [
  {
    name: 'isAssignedToOrganization',
    type: 'boolean',
    required: false,
    source: {kind: 'flag', name: 'is-assigned-to-organization'},
  },
  {
    name: 'assignedExternalOrganization',
    type: 'string',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'assigned-external-organization'},
  },
]

/**
 * The documented ActionPlanProjectCreateDTO body field contract. Required:
 * name, description, statusId. Field order follows the archived DTO.
 */
const actionPlanProjectCreateBodyFields: RequestBodyFieldContract[] = [
  requiredStringField('name', 'name'),
  requiredStringField('description', 'description'),
  requiredIntField('statusId', 'status-id'),
  optionalNumberField('costEstimate', 'cost-estimate'),
  optionalDateField('dueDate', 'due-date'),
  optionalIntField('evaluationId', 'evaluation-id'),
  ...actionPlanAssignmentFields,
  ...actionPlanClassificationFields,
]

/**
 * The documented ActionPlanTaskCreateDTO body field contract. Required: name,
 * description, statusId, taskTypeId. `assignedAssessmentObjectiveIds` is a UUID
 * array; `isAssignedToOrganization` is a boolean. Field order follows the DTO.
 */
const actionPlanTaskCreateBodyFields: RequestBodyFieldContract[] = [
  requiredStringField('name', 'name'),
  requiredStringField('description', 'description'),
  requiredIntField('statusId', 'status-id'),
  requiredIntField('taskTypeId', 'task-type-id'),
  optionalNumberField('budget', 'budget'),
  optionalDateField('scheduledCompletionDate', 'scheduled-completion-date'),
  {
    name: 'projectId',
    type: 'string',
    format: 'uuid',
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'project-id'},
  },
  optionalIntField('evaluationId', 'evaluation-id'),
  ...actionPlanAssignmentFields,
  {
    name: 'assignedAssessmentObjectiveIds',
    type: 'array',
    items: {type: 'string', format: 'uuid'},
    required: false,
    nullable: true,
    source: {kind: 'flag', name: 'assigned-assessment-objective-id'},
  },
  ...actionPlanClassificationFields,
  ...actionPlanOrganizationFields,
]

/**
 * The documented ActionPlanSubTaskCreateDTO body field contract. Required:
 * title, description, taskId (UUID), statusId. Field order follows the DTO.
 */
const actionPlanSubTaskCreateBodyFields: RequestBodyFieldContract[] = [
  requiredStringField('title', 'title'),
  requiredStringField('description', 'description'),
  {
    name: 'taskId',
    type: 'string',
    format: 'uuid',
    required: true,
    source: {kind: 'flag', name: 'task-id'},
  },
  requiredIntField('statusId', 'status-id'),
  optionalNumberField('costEstimate', 'cost-estimate'),
  optionalDateField('scheduledCompletionDate', 'scheduled-completion-date'),
  ...actionPlanAssignmentFields,
  ...actionPlanClassificationFields,
  ...actionPlanOrganizationFields,
]

/**
 * The fourteen documented facility body fields, in the archived DTOs' property
 * order. FacilityCreateDTO and FacilityUpdateDTO document the same field
 * names, types, and required set (only `name` is required), and differ in one
 * fact the contract suite compares: the create DTO gives `website` the `uri`
 * format and the update DTO gives it no format. The caller supplies that one
 * field, so the difference between the two contracts is stated once, at the
 * two call sites below, instead of being buried in two near-identical lists.
 *
 * The create DTO also documents a maxLength on `state` and a pattern on
 * `zipCode` that the update DTO omits. Neither appears here because the
 * contract type records only the facts the contract suite compares — name,
 * type, format, required, and nullable.
 */
function facilityBodyFields(websiteField: RequestBodyFieldContract): RequestBodyFieldContract[] {
  return [
    requiredStringField('name', 'name'),
    optionalStringField('description', 'description'),
    optionalIntField('locationTypeId', 'location-type-id'),
    optionalStringField('address', 'address'),
    optionalStringField('addressLine2', 'address-line2'),
    optionalStringField('city', 'city'),
    optionalStringField('state', 'state'),
    optionalStringField('zipCode', 'zip-code'),
    optionalStringField('country', 'country'),
    optionalStringField('phoneNumber', 'phone-number'),
    websiteField,
    optionalStringField('faxNumber', 'fax-number'),
    optionalIntField('employeeCount', 'employee-count'),
    optionalIntField('primaryContactId', 'primary-contact-id'),
  ]
}

/**
 * The documented FacilityCreateDTO body field contract. The DTO marks only
 * `name` required; every other field is optional and nullable, so a create
 * sends just the fields whose flags were given. `website` carries the
 * documented `uri` format.
 */
const facilityCreateBodyFields: RequestBodyFieldContract[] = facilityBodyFields({
  name: 'website',
  type: 'string',
  format: 'uri',
  required: false,
  nullable: true,
  source: {kind: 'flag', name: 'website'},
})

/**
 * The documented FacilityUpdateDTO body field contract. The DTO marks only
 * `name` required, so an update sends just the fields whose flags were given.
 * The update DTO documents `website` as a plain string with no format.
 */
const facilityUpdateBodyFields: RequestBodyFieldContract[] = facilityBodyFields(
  optionalStringField('website', 'website'),
)

/**
 * The twelve documented personnel body fields, in the archived DTOs' property
 * order. PersonnelCreateDTO and PersonnelUpdateDTO document the identical field
 * names, types, formats, required set (`firstName` and `lastName`), and
 * nullable set, so one list states the contract for both the create and the
 * update operation. `department_CD` keeps the documented field name.
 *
 * The create and update DTOs both give `firstName` and `lastName` a minLength
 * of 1. That constraint does not appear here because the contract type records
 * only the facts the contract suite compares — name, type, format, required,
 * and nullable.
 */
const personnelWriteBodyFields: RequestBodyFieldContract[] = [
  requiredStringField('firstName', 'first-name'),
  requiredStringField('lastName', 'last-name'),
  optionalStringField('middleName', 'middle-name'),
  optionalStringField('title', 'title'),
  optionalStringField('description', 'description'),
  optionalStringField('emailAddress', 'email-address'),
  optionalStringField('phoneNumber', 'phone-number'),
  optionalStringField('officeNumber', 'office-number'),
  optionalStringField('networkUserName', 'network-user-name'),
  optionalStringField('department_CD', 'department-cd'),
  optionalStringField('adDomain', 'ad-domain'),
  optionalIntField('userTypeId', 'user-type-id'),
]

/**
 * The documented optional `parentId` body field, shared by the two evidence
 * create bodies. Both DTOs document it as a nullable UUID string.
 */
const parentIdBodyField: RequestBodyFieldContract = {
  name: 'parentId',
  type: 'string',
  format: 'uuid',
  required: false,
  nullable: true,
  source: {kind: 'flag', name: 'parent-id'},
}

/**
 * The documented EvidenceLinkCreateDTO body field contract, in the archived
 * DTO's property order. Required: `fileName` and `url`. The DTO gives `url` the
 * `uri` format and gives both required fields a minLength of 1; the minLength
 * does not appear here because the contract type records only the facts the
 * contract suite compares — name, type, format, required, and nullable.
 */
const evidenceLinkCreateBodyFields: RequestBodyFieldContract[] = [
  requiredStringField('fileName', 'file-name'),
  {name: 'url', type: 'string', format: 'uri', required: true, source: {kind: 'flag', name: 'url'}},
  optionalStringField('description', 'description'),
  parentIdBodyField,
]

/**
 * The documented EvidenceFolderCreateDTO body field contract, in the archived
 * DTO's property order. Required: `name`.
 */
const evidenceFolderCreateBodyFields: RequestBodyFieldContract[] = [
  requiredStringField('name', 'name'),
  parentIdBodyField,
]

/** Contract for one documented GET operation. */
function get(path: string, parameters: ParameterContract[] = []): OperationContract {
  return {method: 'get', path, parameters}
}

/** Contract for one documented POST operation with a request-body contract. */
function post(path: string, requestBody: RequestBodyFieldContract[]): OperationContract {
  return {method: 'post', path, parameters: [], requestBody}
}

/** Contract for one documented PUT operation with a path and request body. */
function put(
  path: string,
  parameters: ParameterContract[],
  requestBody: RequestBodyFieldContract[],
): OperationContract {
  return {method: 'put', path, parameters, requestBody}
}

/** Contract for one documented DELETE operation, which carries no body. */
function del(path: string, parameters: ParameterContract[]): OperationContract {
  return {method: 'delete', path, parameters}
}

export const commandSpecs: CommandSpec[] = [
  {
    id: 'auth login',
    summary: 'Create or replace one named profile after tenant discovery.',
    kind: 'profile',
    permission: null,
    args: [],
    flags: [
      {
        name: 'profile',
        type: 'option',
        required: true,
        summary: 'Profile name to create or replace.',
      },
      {
        name: 'client-id',
        type: 'option',
        required: true,
        summary: 'Client ID of the IntelliGRC API credential.',
      },
      {
        name: 'client-secret-env',
        type: 'option',
        required: false,
        summary:
          'Name of the environment variable that holds the client secret. ' +
          'Without this flag, login reads the secret from a masked prompt.',
      },
      {
        name: 'base-url',
        type: 'option',
        required: false,
        summary: 'IntelliGRC API base URL saved into the profile. HTTPS required.',
      },
      {
        name: 'replace',
        type: 'boolean',
        required: false,
        summary: 'Replace an existing profile with the same name.',
      },
    ],
  },
  {
    id: 'auth list',
    summary: 'Print profile names and non-secret settings.',
    kind: 'profile',
    permission: null,
    args: [],
    flags: [
      {
        name: 'output',
        type: 'option',
        required: false,
        allowedValues: ['json'],
        default: 'json',
        summary: 'Output format.',
      },
    ],
  },
  {
    id: 'auth remove',
    summary: 'Remove one named profile and its protected secret.',
    kind: 'profile',
    permission: null,
    args: [],
    flags: [
      {
        name: 'profile',
        type: 'option',
        required: true,
        summary: 'Profile name to remove.',
      },
    ],
  },
  {
    id: 'commands',
    summary: 'Print the local command catalog.',
    kind: 'local',
    permission: null,
    args: [],
    flags: [
      {
        name: 'output',
        type: 'option',
        required: false,
        allowedValues: ['json'],
        default: 'json',
        summary: 'Output format.',
      },
    ],
  },
  {
    id: 'doctor',
    summary: 'Diagnose one profile without printing credential or tenant values.',
    kind: 'profile',
    permission: null,
    args: [],
    flags: [
      {
        name: 'profile',
        type: 'option',
        required: true,
        summary: 'Profile name to diagnose.',
      },
    ],
  },
  {
    id: 'evaluation current',
    summary: 'Show the current evaluation for the profile tenant.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Evaluations/Current'),
  },
  {
    id: 'evaluation list',
    summary: 'List the evaluations for the profile tenant.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Evaluations'),
  },
  {
    id: 'evaluation create',
    summary: 'Create one evaluation for the profile tenant.',
    kind: 'api',
    permission: 'Evaluations: Write',
    args: [],
    flags: [
      profileFlag,
      evaluationNameFlag,
      evaluationReasonFlag,
      boundaryIdBodyFlag,
      startDateFlag,
      endDateFlag,
      totalBudgetFlag,
      evaluationIclVersionIdFlag,
      evaluationFrameworkIdFlag,
      targetTypeFlag,
      previousEvaluationIdFlag,
      apiOutputFlag,
    ],
    contract: post('/v1/Evaluations', evaluationCreateBodyFields),
  },
  {
    id: 'assessment-objective list',
    summary: 'List assessment objectives and their statuses for an evaluation.',
    kind: 'api',
    permission: 'GapAnalysis: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, frameworkIdFlag, apiOutputFlag],
    contract: get('/v1/AssessmentObjectives', [evaluationIdParameter, frameworkIdParameter]),
  },
  {
    id: 'assessment-objective history',
    summary: 'Show the history of one assessment objective and its statuses.',
    kind: 'api',
    permission: 'GapAnalysis: Read',
    args: [],
    flags: [profileFlag, assessmentObjectiveIdFlag, evaluationIdFlag, apiOutputFlag],
    contract: get('/v1/AssessmentObjectives/History', [assessmentObjectiveIdParameter, evaluationIdParameter]),
  },
  {
    id: 'assessment-objective update',
    summary: 'Update one assessment objective by its identifier.',
    kind: 'api',
    permission: 'GapAnalysis: Write',
    args: [assessmentObjectiveIdArg],
    flags: [
      profileFlag,
      updateEvaluationIdFlag,
      updateStatusIdFlag,
      implementationDetailFlag,
      findingDetailFlag,
      recommendationDetailFlag,
      validationMethodsFlag,
      apiOutputFlag,
    ],
    contract: put(
      '/v1/AssessmentObjectives/{id}',
      [assessmentObjectiveIdPathParameter],
      assessmentObjectiveUpdateBodyFields,
    ),
  },
  {
    id: 'control list',
    summary: 'List controls and their summary statements for an evaluation.',
    kind: 'api',
    permission: 'GapAnalysis: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, frameworkIdFlag, apiOutputFlag],
    contract: get('/v1/Controls', [evaluationIdParameter, frameworkIdParameter]),
  },
  {
    id: 'control update',
    summary: 'Update the summary statement and evaluation of one control by its identifier.',
    kind: 'api',
    permission: 'GapAnalysis: Write',
    args: [controlIdArg],
    flags: [profileFlag, updateEvaluationIdFlag, summaryStatementFlag, apiOutputFlag],
    contract: put('/v1/Controls/{controlId}', [controlIdPathParameter], controlUpdateBodyFields),
  },
  {
    id: 'evidence for-evaluation',
    summary: 'List uploaded evidence for an evaluation.',
    kind: 'api',
    permission: 'Evidence: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, frameworkIdFlag, apiOutputFlag],
    contract: get('/v1/Evidence/Evaluation', [evaluationIdParameter, frameworkIdParameter]),
  },
  {
    id: 'evidence list',
    summary: 'List all uploaded evidence for the profile tenant.',
    kind: 'api',
    permission: 'Evidence: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Evidence'),
  },
  {
    id: 'evidence assessment-objectives set',
    summary: 'Set the assessment objectives mapped to one piece of evidence.',
    kind: 'api',
    permission: 'Evidence: Write',
    args: [evidenceIdArg],
    flags: [profileFlag, assessmentObjectiveIdSetFlag, preserveExistingFlag, apiOutputFlag],
    contract: put(
      '/v1/Evidence/{id}/AssessmentObjectives',
      [evidenceIdPathParameter, preserveExistingParameter],
      assessmentObjectiveIdsBodyFields,
    ),
  },
  {
    id: 'evidence create',
    summary: 'Create one piece of link-based evidence for the profile tenant.',
    kind: 'api',
    permission: 'Evidence: Write',
    args: [],
    flags: [
      profileFlag,
      evidenceFileNameFlag,
      evidenceUrlFlag,
      evidenceDescriptionFlag,
      parentIdBodyFlag,
      apiOutputFlag,
    ],
    contract: post('/v1/Evidence', evidenceLinkCreateBodyFields),
  },
  {
    id: 'evidence-folder list',
    summary: 'List evidence folders, optionally under one parent folder.',
    kind: 'api',
    permission: 'Evidence: Read',
    args: [],
    flags: [profileFlag, parentIdQueryFlag, apiOutputFlag],
    contract: get('/v1/Evidence/Folders', [parentIdParameter]),
  },
  {
    id: 'evidence-folder create',
    summary: 'Create one evidence folder for the profile tenant.',
    kind: 'api',
    permission: 'Evidence: Write',
    args: [],
    flags: [profileFlag, evidenceFolderNameFlag, parentIdBodyFlag, apiOutputFlag],
    contract: post('/v1/Evidence/Folders', evidenceFolderCreateBodyFields),
  },
  {
    id: 'action-plan-project list',
    summary: 'List action-plan projects for an evaluation.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, includeTasksFlag, includeSubTasksFlag, apiOutputFlag],
    contract: get('/v1/ActionPlanProjects', [evaluationIdParameter, includeTasksParameter, includeSubTasksParameter]),
  },
  {
    id: 'action-plan-project create',
    summary: 'Create one action-plan project for the profile tenant.',
    kind: 'api',
    permission: 'ActionPlan: Write',
    args: [],
    flags: [
      profileFlag,
      apNameFlag,
      apDescriptionFlag,
      apProjectStatusIdFlag,
      costEstimateFlag,
      dueDateFlag,
      actionPlanEvaluationIdFlag,
      assignedDepartmentIdFlag,
      assignedPersonnelIdFlag,
      assignedWatcherIdFlag,
      levelOfEffortIdFlag,
      priorityLevelIdFlag,
      subCategoryIdFlag,
      apiOutputFlag,
    ],
    contract: post('/v1/ActionPlanProjects', actionPlanProjectCreateBodyFields),
  },
  {
    id: 'action-plan-task list',
    summary: 'List action-plan tasks for an evaluation.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, includeSubTasksFlag, apiOutputFlag],
    contract: get('/v1/ActionPlanTasks', [evaluationIdParameter, includeSubTasksParameter]),
  },
  {
    id: 'action-plan-task create',
    summary: 'Create one action-plan task for the profile tenant.',
    kind: 'api',
    permission: 'ActionPlan: Write',
    args: [],
    flags: [
      profileFlag,
      apNameFlag,
      apDescriptionFlag,
      apTaskStatusIdFlag,
      taskTypeIdFlag,
      budgetFlag,
      scheduledCompletionDateFlag,
      projectIdFlag,
      actionPlanEvaluationIdFlag,
      assignedDepartmentIdFlag,
      assignedPersonnelIdFlag,
      assignedWatcherIdFlag,
      assignedAssessmentObjectiveIdFlag,
      levelOfEffortIdFlag,
      priorityLevelIdFlag,
      subCategoryIdFlag,
      isAssignedToOrganizationFlag,
      assignedExternalOrganizationFlag,
      apiOutputFlag,
    ],
    contract: post('/v1/ActionPlanTasks', actionPlanTaskCreateBodyFields),
  },
  {
    id: 'action-plan-subtask list',
    summary: 'List action-plan subtasks for an evaluation.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, apiOutputFlag],
    contract: get('/v1/ActionPlanSubTasks', [evaluationIdParameter]),
  },
  {
    id: 'action-plan-subtask create',
    summary: 'Create one action-plan subtask for the profile tenant.',
    kind: 'api',
    permission: 'ActionPlan: Write',
    args: [],
    flags: [
      profileFlag,
      subTaskTitleFlag,
      apDescriptionFlag,
      subTaskTaskIdFlag,
      apSubTaskStatusIdFlag,
      costEstimateFlag,
      scheduledCompletionDateFlag,
      assignedDepartmentIdFlag,
      assignedPersonnelIdFlag,
      assignedWatcherIdFlag,
      levelOfEffortIdFlag,
      priorityLevelIdFlag,
      subCategoryIdFlag,
      isAssignedToOrganizationFlag,
      assignedExternalOrganizationFlag,
      apiOutputFlag,
    ],
    contract: post('/v1/ActionPlanSubTasks', actionPlanSubTaskCreateBodyFields),
  },
  {
    id: 'boundary list',
    summary: 'List the boundaries (systems) for the profile tenant.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Boundaries'),
  },
  {
    id: 'boundary create',
    summary: 'Create one boundary (system) for the profile tenant.',
    kind: 'api',
    permission: 'Boundaries: Write',
    args: [],
    flags: [
      profileFlag,
      boundaryNameFlag,
      uniqueIdentifierFlag,
      operationalStatusIdFlag,
      systemTypeIdFlag,
      boundaryDescriptionFlag,
      systemEnvironmentFlag,
      networkArchitectureDetailsFlag,
      operationalStatusDetailsFlag,
      informationSystemTypeIdFlag,
      informationSystemTypeDetailsFlag,
      boundaryConfidentialityIdFlag,
      boundaryIntegrityIdFlag,
      boundaryAvailabilityIdFlag,
      securityCategoryIdFlag,
      networkDiagramIdFlag,
      dataFlowDiagramIdFlag,
      deviceIdFlag,
      locationIdFlag,
      sensitiveInformationTypeIdFlag,
      boundaryInterconnectionIdFlag,
      lawRegulationPolicyIdFlag,
      boundaryPersonnelIdFlag,
      boundaryFrameworkIdFlag,
      cageCodeFlag,
      apiOutputFlag,
    ],
    contract: post('/v1/Boundaries', boundaryCreateBodyFields),
  },
  {
    id: 'data-type get',
    summary: 'Show one data type by its integer identifier.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [dataTypeIdArg],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/DataTypes/{id}', [idPathParameter]),
  },
  {
    id: 'data-type list',
    summary: 'List the data types for the profile tenant.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/DataTypes'),
  },
  {
    id: 'data-type create',
    summary: 'Create one data type for the profile tenant.',
    kind: 'api',
    permission: 'DataTypes: Write',
    args: [],
    flags: [
      profileFlag,
      dataTypeNameFlag,
      dataTypeDescriptionFlag,
      confidentialityIdFlag,
      integrityIdFlag,
      availabilityIdFlag,
      apiOutputFlag,
    ],
    contract: post('/v1/DataTypes', dataTypeBodyFields),
  },
  {
    id: 'data-type update',
    summary: 'Update one data type by its integer identifier.',
    kind: 'api',
    permission: 'DataTypes: Write',
    args: [dataTypeIdArg],
    flags: [
      profileFlag,
      dataTypeNameFlag,
      dataTypeDescriptionFlag,
      confidentialityIdFlag,
      integrityIdFlag,
      availabilityIdFlag,
      apiOutputFlag,
    ],
    contract: put('/v1/DataTypes/{id}', [idPathParameter], dataTypeBodyFields),
  },
  {
    id: 'data-type delete',
    summary: 'Delete one data type by its integer identifier, after a confirmation pause.',
    kind: 'api',
    permission: 'DataTypes: Write',
    args: [dataTypeIdArg],
    flags: [profileFlag, yesFlag, apiOutputFlag],
    contract: del('/v1/DataTypes/{id}', [idPathParameter]),
  },
  {
    id: 'facility list',
    summary: 'List the facilities for the profile tenant.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Facilities'),
  },
  {
    id: 'facility get',
    summary: 'Show one facility by its integer identifier.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [facilityIdArg],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Facilities/{id}', [idPathParameter]),
  },
  {
    id: 'facility data-types',
    summary: 'List the data types associated with one facility.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [facilityIdArg],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Facilities/{id}/datatypes', [idPathParameter]),
  },
  {
    id: 'facility data-types set',
    summary: 'Replace the data types associated with one facility.',
    kind: 'api',
    permission: 'Locations: Write',
    args: [facilityIdArg],
    flags: [profileFlag, dataTypeIdFlag, apiOutputFlag],
    contract: put('/v1/Facilities/{id}/datatypes', [idPathParameter], dataTypeIdsBodyFields),
  },
  {
    id: 'facility create',
    summary: 'Create one facility for the profile tenant.',
    kind: 'api',
    permission: 'Locations: Write',
    args: [],
    flags: [profileFlag, ...facilityWriteFlags, apiOutputFlag],
    contract: post('/v1/Facilities', facilityCreateBodyFields),
  },
  {
    id: 'facility update',
    summary: 'Update one facility by its integer identifier.',
    kind: 'api',
    permission: 'Locations: Write',
    args: [facilityIdArg],
    flags: [profileFlag, ...facilityWriteFlags, apiOutputFlag],
    contract: put('/v1/Facilities/{id}', [idPathParameter], facilityUpdateBodyFields),
  },
  {
    id: 'interconnection list',
    summary: 'List the interconnections for the profile tenant.',
    kind: 'api',
    permission: 'Interconnections: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Interconnections'),
  },
  {
    id: 'interconnection get',
    summary: 'Show one interconnection by its integer identifier.',
    kind: 'api',
    permission: 'Interconnections: Read',
    args: [interconnectionIdArg],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Interconnections/{id}', [idPathParameter]),
  },
  {
    id: 'interconnection data-types',
    summary: 'List the data types associated with one interconnection.',
    kind: 'api',
    permission: 'Interconnections: Read',
    args: [interconnectionIdArg],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Interconnections/{id}/datatypes', [idPathParameter]),
  },
  {
    id: 'interconnection data-types set',
    summary: 'Replace the data types associated with one interconnection.',
    kind: 'api',
    permission: 'Interconnections: Write',
    args: [interconnectionIdArg],
    flags: [profileFlag, dataTypeIdFlag, apiOutputFlag],
    contract: put('/v1/Interconnections/{id}/datatypes', [idPathParameter], dataTypeIdsBodyFields),
  },
  {
    id: 'interconnection create',
    summary: 'Create one interconnection for the profile tenant.',
    kind: 'api',
    permission: 'Interconnections: Write',
    args: [],
    flags: [
      profileFlag,
      interconnectionNameFlag,
      interconnectionProviderFlag,
      interconnectionDescriptionFlag,
      createAuthorizingOfficialIdFlag,
      createAuthorizationTypeFlag,
      apiOutputFlag,
    ],
    contract: post('/v1/Interconnections', interconnectionCreateBodyFields),
  },
  {
    id: 'interconnection update',
    summary: 'Update one interconnection by its integer identifier.',
    kind: 'api',
    permission: 'Interconnections: Write',
    args: [interconnectionIdArg],
    flags: [
      profileFlag,
      interconnectionNameFlag,
      interconnectionProviderFlag,
      interconnectionDescriptionFlag,
      updateAuthorizingOfficialIdFlag,
      updateAuthorizationTypeFlag,
      apiOutputFlag,
    ],
    contract: put('/v1/Interconnections/{id}', [idPathParameter], interconnectionUpdateBodyFields),
  },
  {
    id: 'personnel list',
    summary: 'List the personnel for the profile tenant.',
    kind: 'api',
    permission: 'Personnel: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Personnel'),
  },
  {
    id: 'personnel get',
    summary: 'Show one person by their integer identifier.',
    kind: 'api',
    permission: 'Personnel: Read',
    args: [personnelIdArg],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Personnel/{id}', [idPathParameter]),
  },
  {
    id: 'personnel create',
    summary: 'Create one person for the profile tenant.',
    kind: 'api',
    permission: 'Personnel: Write',
    args: [],
    flags: [profileFlag, ...personnelWriteFlags, apiOutputFlag],
    contract: post('/v1/Personnel', personnelWriteBodyFields),
  },
  {
    id: 'personnel update',
    summary: 'Update one person by their integer identifier.',
    kind: 'api',
    permission: 'Personnel: Write',
    args: [personnelIdArg],
    flags: [profileFlag, ...personnelWriteFlags, apiOutputFlag],
    contract: put('/v1/Personnel/{id}', [idPathParameter], personnelWriteBodyFields),
  },
  {
    id: 'personnel delete',
    summary: 'Delete one person by their integer identifier, after a confirmation pause.',
    kind: 'api',
    permission: 'Personnel: Write',
    args: [personnelIdArg],
    flags: [profileFlag, yesFlag, apiOutputFlag],
    contract: del('/v1/Personnel/{id}', [idPathParameter]),
  },
  {
    id: 'lookup action-plan project-statuses',
    summary: 'List the action-plan project status options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/actionplan/projectstatuses'),
  },
  {
    id: 'lookup action-plan task-statuses',
    summary: 'List the action-plan task status options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/actionplan/taskstatuses'),
  },
  {
    id: 'lookup action-plan subtask-statuses',
    summary: 'List the action-plan subtask status options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/actionplan/subtaskstatuses'),
  },
  {
    id: 'lookup action-plan task-types',
    summary: 'List the action-plan task type options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/actionplan/tasktypes'),
  },
  {
    id: 'lookup action-plan levels-of-effort',
    summary: 'List the action-plan level of effort options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/actionplan/levelsofeffort'),
  },
  {
    id: 'lookup action-plan priority-levels',
    summary: 'List the action-plan priority level options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/actionplan/prioritylevels'),
  },
  {
    id: 'lookup action-plan categories',
    summary: 'List the action-plan category options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/actionplan/categories'),
  },
  {
    id: 'lookup action-plan subcategories',
    summary: 'List the action-plan subcategory options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/actionplan/subcategories'),
  },
  {
    id: 'lookup assessment-objective statuses',
    summary: 'List the assessment objective status options.',
    kind: 'api',
    permission: 'GapAnalysis: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/assessmentobjectives/statuses'),
  },
  {
    id: 'lookup boundary operational-statuses',
    summary: 'List the boundary operational status options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/boundaries/operationalstatuses'),
  },
  {
    id: 'lookup boundary information-system-types',
    summary: 'List the boundary information system type options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/boundaries/informationsystemtypes'),
  },
  {
    id: 'lookup boundary confidentiality-levels',
    summary: 'List the boundary confidentiality level options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/boundaries/confidentialitylevels'),
  },
  {
    id: 'lookup boundary integrity-levels',
    summary: 'List the boundary integrity level options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/boundaries/integritylevels'),
  },
  {
    id: 'lookup boundary availability-levels',
    summary: 'List the boundary availability level options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/boundaries/availabilitylevels'),
  },
  {
    id: 'lookup data-type confidentiality-levels',
    summary: 'List the data-type confidentiality level options.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/datatypes/confidentialitylevels'),
  },
  {
    id: 'lookup data-type integrity-levels',
    summary: 'List the data-type integrity level options.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/datatypes/integritylevels'),
  },
  {
    id: 'lookup data-type availability-levels',
    summary: 'List the data-type availability level options.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/datatypes/availabilitylevels'),
  },
  {
    id: 'lookup facility types',
    summary: 'List the facility type options.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/facilities/types'),
  },
  {
    id: 'lookup facility states',
    summary: 'List the supported US state and territory options for facilities.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/facilities/states'),
  },
  {
    id: 'lookup facility data-types',
    summary: 'List the data type options that can be associated with a facility.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/facilities/datatypes'),
  },
  {
    id: 'lookup facility asset-categories',
    summary: 'List the asset category options that can be associated with a facility.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/facilities/assetcategories'),
  },
  {
    id: 'lookup interconnection types',
    summary: 'List the interconnection type options, each with its sub-types.',
    kind: 'api',
    permission: 'Interconnections: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/interconnections/types'),
  },
  {
    id: 'lookup interconnection authorization-types',
    summary: 'List the authorization type options for interconnections.',
    kind: 'api',
    permission: 'Interconnections: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/interconnections/authorizationtypes'),
  },
  {
    id: 'lookup interconnection asset-categories',
    summary: 'List the asset category options that can be associated with an interconnection.',
    kind: 'api',
    permission: 'Interconnections: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/interconnections/assetcategories'),
  },
  {
    id: 'lookup icl-version list',
    summary: 'List the published Intelligent Control Library versions.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/iclversions'),
  },
  {
    id: 'lookup icl-version latest-frameworks',
    summary: 'List published frameworks for the latest Intelligent Control Library version.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/lookups/iclversions/frameworks'),
  },
  {
    id: 'lookup icl-version frameworks',
    summary: 'List published frameworks for one Intelligent Control Library version.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, iclVersionIdFlag, apiOutputFlag],
    contract: get('/v1/lookups/iclversions/{iclVersionId}/frameworks', [iclVersionIdParameter]),
  },
  {
    id: 'tenant list',
    summary: 'List the tenants manageable by the profile credential.',
    kind: 'api',
    permission: null,
    args: [],
    flags: [
      {
        name: 'profile',
        type: 'option',
        required: true,
        summary: 'Profile that supplies the credential and base URL.',
      },
      apiOutputFlag,
    ],
    contract: get('/v1/Tenants'),
  },
  {
    id: 'version',
    summary: 'Print the installed package version.',
    kind: 'local',
    permission: null,
    args: [],
    flags: [],
  },
]

/**
 * One catalog entry: the public command description without the contract
 * metadata. The catalog shape is unchanged from catalogVersion 1; the
 * contract stays an internal fact proved by the contract suite.
 */
export type CatalogCommand = Omit<CommandSpec, 'contract'>

export interface Catalog {
  catalogVersion: 1
  commands: CatalogCommand[]
}

export function buildCatalog(): Catalog {
  return {
    catalogVersion: 1,
    commands: commandSpecs.map(({id, summary, kind, permission, args, flags}) => ({
      id,
      summary,
      kind,
      permission,
      args,
      flags,
    })),
  }
}

/** Look up one command's spec. Throws when the id is not in the manifest. */
export function commandSpec(id: string): CommandSpec {
  const spec = commandSpecs.find((candidate) => candidate.id === id)
  if (!spec) {
    throw new Error(`Command "${id}" is missing from the manifest.`)
  }

  return spec
}

/**
 * Look up one API command's spec with its operation contract. Throws when
 * the id is not an API command or carries no contract, so a command file
 * cannot silently run without a documented path.
 */
export function apiCommandSpec(id: string): ApiCommandSpec {
  const spec = commandSpec(id)
  if (spec.kind !== 'api' || !spec.contract) {
    throw new Error(`Command "${id}" has no operation contract in the manifest.`)
  }

  return spec as ApiCommandSpec
}

/**
 * Convert one spec's args into oclif argument definitions. Every arg is
 * defined as a string; integer validation happens in the command through
 * the shared filter parsers, so the failure keeps the stable error code
 * and exit-2 contract.
 */
export function oclifArgs(spec: CommandSpec): Interfaces.ArgInput {
  const args: Interfaces.ArgInput = {}
  for (const arg of spec.args) {
    args[arg.name] = Args.string({description: arg.summary, required: arg.required})
  }

  return args
}

/** Convert one spec's flags into oclif flag definitions. */
export function oclifFlags(spec: CommandSpec): Interfaces.FlagInput {
  const flags: Interfaces.FlagInput = {}
  for (const flag of spec.flags) {
    if (flag.type === 'boolean') {
      flags[flag.name] = Flags.boolean({summary: flag.summary, required: flag.required})
    } else if (flag.multiple) {
      // A repeatable option collects every occurrence into a string array;
      // it carries no scalar default, so it stays undefined when omitted.
      flags[flag.name] = Flags.string({
        summary: flag.summary,
        required: flag.required,
        options: flag.allowedValues,
        multiple: true,
      })
    } else {
      flags[flag.name] = Flags.string({
        summary: flag.summary,
        required: flag.required,
        options: flag.allowedValues,
        default: flag.default,
      })
    }
  }

  return flags
}
