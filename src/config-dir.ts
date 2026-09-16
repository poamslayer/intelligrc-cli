/**
 * Where this CLI keeps `profiles.json` and `secrets.json`.
 *
 * The executable gets this directory from oclif. A library caller consuming
 * the `core` export subpath has no oclif, and must still find the profile a
 * person created with `intelligrc auth login` — so the rule lives here,
 * once, tested against what oclif actually computes.
 *
 * The rule is oclif's, reproduced deliberately rather than approximated:
 *
 * 1. `INTELLIGRC_CONFIG_DIR`, if set. oclif scopes this variable by the
 *    executable's name, and this is the name it produces.
 * 2. Otherwise `<base>/intelligrc`, where `<base>` is `XDG_CONFIG_HOME`,
 *    else `LOCALAPPDATA` on Windows, else `<home>/.config`.
 * 3. `<home>` is `HOME`, else the platform's home directory, else the
 *    temporary directory — the last being oclif's own final fallback.
 */
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'

import type {EnvironmentVariables} from './environment.js'

/** The directory name oclif derives from the executable's name. */
export const CONFIG_DIRNAME = 'intelligrc'

/** The scoped variable oclif reads before computing anything. */
export const CONFIG_DIR_VARIABLE = 'INTELLIGRC_CONFIG_DIR'

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value
}

/**
 * Resolve the configuration directory for one environment. `platform` is a
 * parameter rather than a lookup so the Windows branch is testable from any
 * machine; it defaults to the running platform.
 */
export function resolveConfigDir(
  env: EnvironmentVariables,
  platform: string = process.platform,
): string {
  const scoped = nonEmpty(env[CONFIG_DIR_VARIABLE])
  if (scoped) {
    return scoped
  }

  const home = nonEmpty(env.HOME) ?? homedir() ?? tmpdir()
  const base =
    nonEmpty(env.XDG_CONFIG_HOME) ??
    (platform === 'win32' ? nonEmpty(env.LOCALAPPDATA) : undefined) ??
    join(home, '.config')

  return join(base, CONFIG_DIRNAME)
}
