/**
 * Protected-secret store. The only implementation wraps @napi-rs/keyring,
 * which selects Windows Credential Manager, macOS Keychain, Linux Secret
 * Service, or the Linux kernel keyring. There is no plaintext fallback:
 * when the platform store is unavailable, operations fail with exit code 3.
 */
import {Entry} from '@napi-rs/keyring'

import {CliFailure, EXIT} from './errors.js'

const SERVICE = 'intelligrc-cli'

export interface SecretStore {
  /** Return the stored secret, or null when no entry exists. */
  get(profileName: string): string | null
  set(profileName: string, secret: string): void
  /** Delete the entry. Returns false when no entry existed. */
  delete(profileName: string): boolean
}

function isNoEntryError(error: unknown): boolean {
  return error instanceof Error && /no matching entry|no entry/i.test(error.message)
}

function storeFailure(operation: string, error: unknown): CliFailure {
  const detail = error instanceof Error ? error.message : String(error)
  return new CliFailure({
    code: 'secret-store-failure',
    message:
      `The protected secret store failed to ${operation} the client secret: ` +
      `${detail}. The CLI does not fall back to plaintext storage.`,
    exitCode: EXIT.localConfiguration,
  })
}

export class KeyringSecretStore implements SecretStore {
  get(profileName: string): string | null {
    try {
      return new Entry(SERVICE, profileName).getPassword()
    } catch (error) {
      if (isNoEntryError(error)) {
        return null
      }

      throw storeFailure('read', error)
    }
  }

  set(profileName: string, secret: string): void {
    try {
      new Entry(SERVICE, profileName).setPassword(secret)
    } catch (error) {
      throw storeFailure('write', error)
    }
  }

  delete(profileName: string): boolean {
    try {
      return new Entry(SERVICE, profileName).deleteCredential()
    } catch (error) {
      if (isNoEntryError(error)) {
        return false
      }

      throw storeFailure('delete', error)
    }
  }
}
