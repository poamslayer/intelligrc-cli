/** Client secrets stored separately from non-secret profile settings. */
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {join} from 'node:path'

import {CliFailure, EXIT} from './errors.js'

interface SecretsFile {
  secretsVersion: 1
  secrets: Record<string, string>
}

const EMPTY: SecretsFile = {secretsVersion: 1, secrets: {}}

export interface SecretStore {
  readonly filePath: string
  get(profileName: string): string | null
  set(profileName: string, secret: string): void
  delete(profileName: string): boolean
}

export class FileSecretStore implements SecretStore {
  readonly filePath: string
  private readonly configDir: string

  constructor(configDir: string) {
    this.configDir = configDir
    this.filePath = join(configDir, 'secrets.json')
  }

  /** Return the stored secret, or null when the file or entry is missing. */
  get(profileName: string): string | null {
    return this.read().secrets[profileName] ?? null
  }

  set(profileName: string, secret: string): void {
    const file = this.read()
    file.secrets[profileName] = secret
    this.write(file)
  }

  /** Delete the entry. Returns false when the file or entry is missing. */
  delete(profileName: string): boolean {
    const file = this.read()
    if (!(profileName in file.secrets)) {
      return false
    }

    delete file.secrets[profileName]
    this.write(file)
    return true
  }

  private read(): SecretsFile {
    let raw: string
    try {
      if (process.platform !== 'win32') {
        const mode = statSync(this.filePath).mode
        if ((mode & 0o077) !== 0) {
          throw new CliFailure({
            code: 'secrets-file-permissions',
            message:
              `${this.filePath} is readable by group or others. ` +
              `Run: chmod 600 ${this.filePath}`,
            exitCode: EXIT.localConfiguration,
          })
        }
      }

      raw = readFileSync(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return structuredClone(EMPTY)
      }

      if (error instanceof CliFailure) {
        throw error
      }

      throw this.failure('read', error)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw this.failure('parse', error)
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as {secretsVersion?: unknown}).secretsVersion !== 1 ||
      typeof (parsed as {secrets?: unknown}).secrets !== 'object' ||
      (parsed as {secrets?: unknown}).secrets === null ||
      Array.isArray((parsed as {secrets?: unknown}).secrets)
    ) {
      throw this.failure('read', new Error('unrecognized secrets.json structure'))
    }

    return parsed as SecretsFile
  }

  private write(file: SecretsFile): void {
    const temporaryPath = `${this.filePath}.tmp-${process.pid}`
    try {
      mkdirSync(this.configDir, {recursive: true, mode: 0o700})
      writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, {mode: 0o600})
      try {
        renameSync(temporaryPath, this.filePath)
      } catch (error) {
        rmSync(temporaryPath, {force: true})
        throw error
      }
    } catch (error) {
      throw this.failure('write', error)
    }
  }

  private failure(operation: string, error: unknown): CliFailure {
    const detail = error instanceof Error ? error.message : String(error)
    return new CliFailure({
      code: 'secret-store-failure',
      message: `Failed to ${operation} ${this.filePath}: ${detail}`,
      exitCode: EXIT.localConfiguration,
    })
  }
}

/** Restore the secret state after a profile file write fails. */
export function restoreSecret(
  store: SecretStore,
  profileName: string,
  hadProfile: boolean,
  priorSecret: string | null,
): void {
  try {
    if (hadProfile && priorSecret !== null) {
      store.set(profileName, priorSecret)
    } else {
      store.delete(profileName)
    }
  } catch {
    throw new CliFailure({
      code: 'rollback-failed',
      message:
        'Writing profiles.json failed and the client secret in ' +
        `${store.filePath} for profile "${profileName}" could not be restored. ` +
        'Repair the secrets file manually.',
      exitCode: EXIT.localConfiguration,
    })
  }
}
