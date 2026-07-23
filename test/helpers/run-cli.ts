import {spawn} from 'node:child_process'
import {mkdtempSync} from 'node:fs'
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

/**
 * Process-level test seam. Spawns the built executable with isolated
 * per-user state and returns the raw output bytes and exit code.
 *
 * Isolation:
 * - HOME and every XDG base directory point at a fresh temp directory.
 * - Every INTELLIGRC_* environment variable is removed.
 */
export function runCli(args: string[], options: {cwd?: string} = {}): Promise<CliResult> {
  const isolatedHome = mkdtempSync(join(tmpdir(), 'intelligrc-cli-test-'))

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('INTELLIGRC_')) {
      env[key] = value
    }
  }

  env.HOME = isolatedHome
  env.XDG_CONFIG_HOME = join(isolatedHome, '.config')
  env.XDG_DATA_HOME = join(isolatedHome, '.local', 'share')
  env.XDG_CACHE_HOME = join(isolatedHome, '.cache')

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
