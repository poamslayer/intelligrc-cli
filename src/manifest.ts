/**
 * Typed command manifest. Single source of truth for the command catalog.
 *
 * Later slices extend this file with API commands and reuse it for command
 * registration checks, help text, permission text, and contract tests.
 */

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
  /** 'local' commands never load a profile and never contact a network service. */
  kind: 'local'
  /** Documented IntelliGRC permission. Always null for local commands. */
  permission: null
  args: ArgSpec[]
  flags: FlagSpec[]
}

export const commandSpecs: CommandSpec[] = [
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
