/**
 * Typed command manifest. Single source of truth for the command catalog.
 * Command classes derive their summaries and flag definitions from these
 * specs through commandSpec() and oclifFlags(), so the catalog cannot drift
 * from actual command behavior.
 *
 * Later slices extend this file with API commands and reuse it for command
 * registration checks, help text, permission text, and contract tests.
 */
import {Flags, type Interfaces} from '@oclif/core'

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
   * Documented IntelliGRC permission. Null for local and profile commands,
   * and for API operations whose contract documents no permission (the
   * tenant-list operation).
   */
  permission: null
  args: ArgSpec[]
  flags: FlagSpec[]
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
