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

const parentIdFlag: FlagSpec = {
  name: 'parent-id',
  type: 'option',
  required: false,
  summary:
    'Parent folder identifier (UUID), sent as the documented parentId ' +
    'query parameter. Omitted from the request when not given, which ' +
    'lists all folders.',
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
    'type associations; omit it to leave them unchanged.',
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
    id: 'evidence-folder list',
    summary: 'List evidence folders, optionally under one parent folder.',
    kind: 'api',
    permission: 'Evidence: Read',
    args: [],
    flags: [profileFlag, parentIdFlag, apiOutputFlag],
    contract: get('/v1/Evidence/Folders', [parentIdParameter]),
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
    id: 'action-plan-task list',
    summary: 'List action-plan tasks for an evaluation.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, includeSubTasksFlag, apiOutputFlag],
    contract: get('/v1/ActionPlanTasks', [evaluationIdParameter, includeSubTasksParameter]),
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
    id: 'boundary list',
    summary: 'List the boundaries (systems) for the profile tenant.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
    contract: get('/v1/Boundaries'),
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
