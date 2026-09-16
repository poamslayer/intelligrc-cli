/**
 * oclif adaptation of the command manifest. The manifest itself is plain
 * data, so it stays free of any oclif import and can be consumed by a
 * library caller through the `core` export subpath. This module is the one
 * place that turns a spec into the argument and flag definitions oclif
 * needs, and only command classes import it.
 */
import {Args, Flags, type Interfaces} from '@oclif/core'

import {type CommandSpec} from './manifest.js'

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
