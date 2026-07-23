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
}

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

const iclVersionIdFlag: FlagSpec = {
  name: 'icl-version-id',
  type: 'option',
  required: true,
  summary:
    'Intelligent Control Library version identifier (UUID), substituted ' +
    'into the documented request path.',
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
  },
  {
    id: 'evaluation list',
    summary: 'List the evaluations for the profile tenant.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'assessment-objective list',
    summary: 'List assessment objectives and their statuses for an evaluation.',
    kind: 'api',
    permission: 'GapAnalysis: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, frameworkIdFlag, apiOutputFlag],
  },
  {
    id: 'assessment-objective history',
    summary: 'Show the history of one assessment objective and its statuses.',
    kind: 'api',
    permission: 'GapAnalysis: Read',
    args: [],
    flags: [profileFlag, assessmentObjectiveIdFlag, evaluationIdFlag, apiOutputFlag],
  },
  {
    id: 'control list',
    summary: 'List controls and their summary statements for an evaluation.',
    kind: 'api',
    permission: 'GapAnalysis: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, frameworkIdFlag, apiOutputFlag],
  },
  {
    id: 'evidence for-evaluation',
    summary: 'List uploaded evidence for an evaluation.',
    kind: 'api',
    permission: 'Evidence: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, frameworkIdFlag, apiOutputFlag],
  },
  {
    id: 'evidence list',
    summary: 'List all uploaded evidence for the profile tenant.',
    kind: 'api',
    permission: 'Evidence: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'evidence-folder list',
    summary: 'List evidence folders, optionally under one parent folder.',
    kind: 'api',
    permission: 'Evidence: Read',
    args: [],
    flags: [profileFlag, parentIdFlag, apiOutputFlag],
  },
  {
    id: 'action-plan-project list',
    summary: 'List action-plan projects for an evaluation.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, includeTasksFlag, includeSubTasksFlag, apiOutputFlag],
  },
  {
    id: 'action-plan-task list',
    summary: 'List action-plan tasks for an evaluation.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, includeSubTasksFlag, apiOutputFlag],
  },
  {
    id: 'action-plan-subtask list',
    summary: 'List action-plan subtasks for an evaluation.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, evaluationIdFlag, apiOutputFlag],
  },
  {
    id: 'boundary list',
    summary: 'List the boundaries (systems) for the profile tenant.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'data-type get',
    summary: 'Show one data type by its integer identifier.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [dataTypeIdArg],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'data-type list',
    summary: 'List the data types for the profile tenant.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'facility list',
    summary: 'List the facilities for the profile tenant.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'facility get',
    summary: 'Show one facility by its integer identifier.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [facilityIdArg],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'facility data-types',
    summary: 'List the data types associated with one facility.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [facilityIdArg],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup action-plan project-statuses',
    summary: 'List the action-plan project status options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup action-plan task-statuses',
    summary: 'List the action-plan task status options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup action-plan subtask-statuses',
    summary: 'List the action-plan subtask status options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup action-plan task-types',
    summary: 'List the action-plan task type options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup action-plan levels-of-effort',
    summary: 'List the action-plan level of effort options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup action-plan priority-levels',
    summary: 'List the action-plan priority level options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup action-plan categories',
    summary: 'List the action-plan category options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup action-plan subcategories',
    summary: 'List the action-plan subcategory options.',
    kind: 'api',
    permission: 'ActionPlan: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup assessment-objective statuses',
    summary: 'List the assessment objective status options.',
    kind: 'api',
    permission: 'GapAnalysis: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup boundary operational-statuses',
    summary: 'List the boundary operational status options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup boundary information-system-types',
    summary: 'List the boundary information system type options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup boundary confidentiality-levels',
    summary: 'List the boundary confidentiality level options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup boundary integrity-levels',
    summary: 'List the boundary integrity level options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup boundary availability-levels',
    summary: 'List the boundary availability level options.',
    kind: 'api',
    permission: 'Boundaries: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup data-type confidentiality-levels',
    summary: 'List the data-type confidentiality level options.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup data-type integrity-levels',
    summary: 'List the data-type integrity level options.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup data-type availability-levels',
    summary: 'List the data-type availability level options.',
    kind: 'api',
    permission: 'DataTypes: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup facility types',
    summary: 'List the facility type options.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup facility states',
    summary: 'List the supported US state and territory options for facilities.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup facility data-types',
    summary: 'List the data type options that can be associated with a facility.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup facility asset-categories',
    summary: 'List the asset category options that can be associated with a facility.',
    kind: 'api',
    permission: 'Locations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup icl-version list',
    summary: 'List the published Intelligent Control Library versions.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup icl-version latest-frameworks',
    summary: 'List published frameworks for the latest Intelligent Control Library version.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, apiOutputFlag],
  },
  {
    id: 'lookup icl-version frameworks',
    summary: 'List published frameworks for one Intelligent Control Library version.',
    kind: 'api',
    permission: 'Evaluations: Read',
    args: [],
    flags: [profileFlag, iclVersionIdFlag, apiOutputFlag],
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

export interface Catalog {
  catalogVersion: 1
  commands: CommandSpec[]
}

export function buildCatalog(): Catalog {
  return {
    catalogVersion: 1,
    commands: commandSpecs,
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
