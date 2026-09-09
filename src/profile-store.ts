/**
 * Non-secret profile settings, stored as one JSON file in the oclif
 * per-user configuration directory. The file never contains the client
 * secret; that value lives only in the secrets file.
 */
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {CliFailure, EXIT} from './errors.js'

export interface ProfileSettings {
  clientId: string
  tenantId: string
  tenantName: string | null
  baseUrl: string
  createdAt: string
}

export interface ProfilesFile {
  profilesVersion: 1
  profiles: Record<string, ProfileSettings>
}

const EMPTY: ProfilesFile = {profilesVersion: 1, profiles: {}}

export class ProfileStore {
  readonly filePath: string
  private readonly configDir: string

  constructor(configDir: string) {
    this.configDir = configDir
    this.filePath = join(configDir, 'profiles.json')
  }

  read(): ProfilesFile {
    let raw: string
    try {
      raw = readFileSync(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return structuredClone(EMPTY)
      }

      throw this.readFailure(error)
    }

    let parsed: ProfilesFile
    try {
      parsed = JSON.parse(raw) as ProfilesFile
    } catch (error) {
      throw this.readFailure(error)
    }

    if (parsed.profilesVersion !== 1 || typeof parsed.profiles !== 'object') {
      throw this.readFailure(new Error('unrecognized profiles.json structure'))
    }

    return parsed
  }

  get(name: string): ProfileSettings | undefined {
    return this.read().profiles[name]
  }

  upsert(name: string, settings: ProfileSettings): void {
    const file = this.read()
    file.profiles[name] = settings
    this.write(file)
  }

  remove(name: string): void {
    const file = this.read()
    delete file.profiles[name]
    this.write(file)
  }

  private write(file: ProfilesFile): void {
    try {
      mkdirSync(this.configDir, {recursive: true})
      const temporaryPath = `${this.filePath}.tmp-${process.pid}`
      writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, {mode: 0o600})
      try {
        renameSync(temporaryPath, this.filePath)
      } catch (error) {
        rmSync(temporaryPath, {force: true})
        throw error
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new CliFailure({
        code: 'profiles-file-write-failed',
        message: `Failed to write ${this.filePath}: ${detail}`,
        exitCode: EXIT.localConfiguration,
      })
    }
  }

  private readFailure(error: unknown): CliFailure {
    const detail = error instanceof Error ? error.message : String(error)
    return new CliFailure({
      code: 'profiles-file-unreadable',
      message: `Failed to read ${this.filePath}: ${detail}`,
      exitCode: EXIT.localConfiguration,
    })
  }
}
