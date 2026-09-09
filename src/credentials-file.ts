/** One complete identity supplied through a read-only credentials file. */
import {readFileSync, statSync} from 'node:fs'
import {resolve} from 'node:path'

import {CliFailure, EXIT} from './errors.js'

export interface CredentialsFile {
  credentialsVersion: 1
  clientId: string
  clientSecret: string
  tenantId: string
  tenantName?: string
  baseUrl?: string
}

/** Read and validate the credentials file named by the environment. */
export function readCredentialsFile(path: string): CredentialsFile {
  const filePath = resolve(process.cwd(), path)

  let raw: string
  try {
    if (process.platform !== 'win32') {
      const mode = statSync(filePath).mode
      if ((mode & 0o077) !== 0) {
        throw new CliFailure({
          code: 'credentials-file-permissions',
          message:
            `${filePath} is readable by group or others. ` +
            `Run: chmod 600 ${filePath}`,
          exitCode: EXIT.localConfiguration,
        })
      }
    }

    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error instanceof CliFailure) {
      throw error
    }

    throw unreadableFailure(filePath, error)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw unreadableFailure(filePath, error)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalidFailure(filePath, 'credentialsVersion')
  }

  const fields = parsed as Record<string, unknown>
  if (fields.credentialsVersion !== 1) {
    throw invalidFailure(filePath, 'credentialsVersion')
  }

  for (const name of ['clientId', 'clientSecret', 'tenantId'] as const) {
    if (typeof fields[name] !== 'string' || fields[name].length === 0) {
      throw invalidFailure(filePath, name)
    }
  }

  for (const name of ['tenantName', 'baseUrl'] as const) {
    if (fields[name] !== undefined && typeof fields[name] !== 'string') {
      throw invalidFailure(filePath, name)
    }
  }

  return fields as unknown as CredentialsFile
}

function unreadableFailure(filePath: string, error: unknown): CliFailure {
  const detail = error instanceof Error ? error.message : String(error)
  return new CliFailure({
    code: 'credentials-file-unreadable',
    message: `Failed to read ${filePath}: ${detail}`,
    exitCode: EXIT.localConfiguration,
  })
}

function invalidFailure(filePath: string, field: string): CliFailure {
  return new CliFailure({
    code: 'credentials-file-invalid',
    message: `${filePath} has an invalid or missing ${field} field.`,
    exitCode: EXIT.localConfiguration,
  })
}
