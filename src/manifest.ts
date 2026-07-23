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
 * The documented operation one API command maps to. The path is the exact
 * documented string; a path template keeps its "{name}" placeholder and
 * the command substitutes the validated identifier at run time.
 */
export interface OperationContract {
  method: 'get'
  path: string
  parameters: ParameterContract[]
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

const iclVersionIdFlag: FlagSpec = {
  name: 'icl-version-id',
  type: 'option',
  required: true,
  summary:
    'Intelligent Control Library version identifier (UUID), substituted ' +
    'into the documented request path.',
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

const iclVersionIdParameter: ParameterContract = {
  name: 'iclVersionId',
  in: 'path',
  required: true,
  type: 'string',
  format: 'uuid',
  source: {kind: 'flag', name: 'icl-version-id'},
}

/** Contract for one documented GET operation. */
function get(path: string, parameters: ParameterContract[] = []): OperationContract {
  return {method: 'get', path, parameters}
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
    flags[flag.name] =
      flag.type === 'boolean'
        ? Flags.boolean({summary: flag.summary, required: flag.required})
        : Flags.string({
            summary: flag.summary,
            required: flag.required,
            options: flag.allowedValues,
            default: flag.default,
          })
  }

  return flags
}
