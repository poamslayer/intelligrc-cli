/**
 * Maps a parse-time oclif error onto the CLI failure contract.
 *
 * oclif raises these errors before a command's own code runs. They never
 * reach emitFailure on their own. Without this module they print
 * human-formatted text on stderr, which breaks the contract that every
 * failure is one JSON object.
 *
 * This module returns null for any error it does not classify. That includes
 * ExitError, which a command throws after it has already written its own
 * failure. bin/run.js hands an unclassified error to oclif's own handler.
 */
import {stripVTControlCharacters} from 'node:util'

import {CliFailure, EXIT} from './errors.js'

/** The command tokens the user typed, before the first flag. */
function commandPath(argv: string[]): string {
  const tokens: string[] = []
  for (const token of argv) {
    if (token.startsWith('-')) {
      break
    }

    tokens.push(token)
  }

  return tokens.join(' ')
}

/**
 * Remediation sentence appended to every parse failure. oclif normally dumps
 * a usage block on stderr; that would leave stderr unparseable, so the
 * message names the help command instead.
 */
function seeHelp(argv: string[]): string {
  const path = commandPath(argv)
  return path === ''
    ? 'Run "intelligrc commands" for the command catalog.'
    : `Run "intelligrc ${path} --help" for its arguments and flags.`
}

export function oclifFailure(error: unknown, argv: string[]): CliFailure | null {
  if (!(error instanceof Error)) {
    return null
  }

  // Every CLIParseError appends this line to its own message. Removing it
  // once keeps it out of every capture below.
  const message = stripVTControlCharacters(error.message)
    .replace(/\nSee more help with --help$/, '')
    .trimEnd()

  const missingFlags = [...message.matchAll(/Missing required flag (\S+)/g)].map(
    (match) => `--${match[1]}`,
  )
  if (missingFlags.length > 0) {
    return new CliFailure({
      code: 'missing-required-flag',
      message: `Missing required flag: ${missingFlags.join(', ')}. ${seeHelp(argv)}`,
      exitCode: EXIT.invalidInput,
    })
  }

  const unknownFlags = message.match(/Nonexistent flags?: (.+)/)
  if (unknownFlags) {
    return new CliFailure({
      code: 'unknown-flag',
      message: `Unknown flag: ${unknownFlags[1].trim()}. ${seeHelp(argv)}`,
      exitCode: EXIT.invalidInput,
    })
  }

  // "Expected --output=yaml to be one of: json, jsonl, table". oclif uses the
  // same wording for an argument whose value is outside its allowed set, but
  // no argument can reach that state today: ArgSpec declares no allowed-value
  // field and oclifArgs always builds Args.string without `options`. Adding an
  // allowed-value set to ArgSpec means adding a separate code here, because
  // this branch would otherwise label an argument failure as a flag failure.
  const invalidOption = message.match(/Expected (.+) to be one of: (.+)/)
  if (invalidOption) {
    return new CliFailure({
      code: 'invalid-flag-value',
      message:
        `${invalidOption[1].trim()} is not allowed. Expected one of: ` +
        `${invalidOption[2].trim()}. ${seeHelp(argv)}`,
      exitCode: EXIT.invalidInput,
    })
  }

  // oclif joins topic segments with a colon internally; this CLI separates
  // them with a space, so the message names the command the way it was typed.
  const notFound = message.match(/^command (\S+) not found/)
  if (notFound) {
    const typed = notFound[1].split(':').join(' ')
    return new CliFailure({
      code: 'command-not-found',
      message:
        `"intelligrc ${typed}" is not a command. Run "intelligrc commands" ` +
        'for the command catalog.',
      exitCode: EXIT.invalidInput,
    })
  }

  // "Missing 1 required arg:\n  id  <description>". The names are the
  // first token of each indented line that follows.
  const missingArgs = message.match(/Missing \d+ required args?:\n([\s\S]*)/)
  if (missingArgs) {
    const names = missingArgs[1]
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => name !== '')
    return new CliFailure({
      code: 'missing-required-argument',
      message: `Missing required argument: ${names.join(', ')}. ${seeHelp(argv)}`,
      exitCode: EXIT.invalidInput,
    })
  }

  const unexpected = message.match(/Unexpected arguments?: (.+)/)
  if (unexpected) {
    return new CliFailure({
      code: 'unexpected-argument',
      message: `Unexpected argument: ${unexpected[1].trim()}. ${seeHelp(argv)}`,
      exitCode: EXIT.invalidInput,
    })
  }

  return null
}
