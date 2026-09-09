import {spawn} from 'node:child_process'
import {mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

export interface CliResult {
  stdout: string
  stderr: string
  code: number | null
}

export const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const binPath = join(projectRoot, 'bin', 'run.js')

export const packageVersion = (
  JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {version: string}
).version

/** Create one isolated per-user state directory for a sequence of CLI runs. */
export function makeIsolatedHome(): string {
  return mkdtempSync(join(tmpdir(), 'intelligrc-cli-test-'))
}

/**
 * Isolation environment shared by every CLI run in the test suite: HOME
 * and the XDG (Cross-Desktop Group) base directories — the standard Linux
 * locations for per-user config, data, and cache — point at the given
 * directory, and every inherited INTELLIGRC_* variable is removed so
 * tests opt in explicitly.
 */
export function isolatedEnv(home: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('INTELLIGRC_')) {
      env[key] = value
    }
  }

  env.HOME = home
  env.XDG_CONFIG_HOME = join(home, '.config')
  env.XDG_DATA_HOME = join(home, '.local', 'share')
  env.XDG_CACHE_HOME = join(home, '.cache')
  return env
}

export interface RunCliOptions {
  cwd?: string
  /** Reuse one isolated home across runs. A fresh temp directory otherwise. */
  home?: string
  /** Extra environment variables. Applied after isolation, so they win. */
  env?: Record<string, string>
}

/**
 * Process-level test seam. Spawns the built executable with isolated
 * per-user state and returns the raw output bytes and exit code.
 *
 * Isolation:
 * - HOME and every XDG (Cross-Desktop Group) base directory — the standard
 *   Linux locations for per-user config, data, and cache — point at a fresh
 *   temp directory (or options.home when a test needs state to persist
 *   across runs).
 * - Every INTELLIGRC_* environment variable is removed. Entries in
 *   options.env are added back afterward, so tests opt in explicitly.
 */
export function runCli(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  const isolatedHome = options.home ?? makeIsolatedHome()

  const env = isolatedEnv(isolatedHome)
  Object.assign(env, options.env)

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd: options.cwd ?? projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({stdout, stderr, code})
    })
  })
}
