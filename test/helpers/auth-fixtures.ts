/**
 * Shared fixtures for the auth command tests: one isolated home with a
 * fake keyring, plus readers for the fake keyring file and profiles.json.
 */
import assert from 'node:assert/strict'
import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'

import {type FakeApi} from './fake-api.ts'
import {fakeKeyringEnv, makeIsolatedHome, runCli} from './run-cli.ts'

export const TEST_SECRET = 'super-secret-value-123'

export interface AuthContext {
  home: string
  keyringFile: string
  env: Record<string, string>
}

export function setupAuthContext(extraEnv: Record<string, string> = {}): AuthContext {
  const home = makeIsolatedHome()
  const keyringFile = join(home, 'fake-keyring.json')
  const env = {
    ...fakeKeyringEnv(keyringFile),
    INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1',
    TEST_CLIENT_SECRET: TEST_SECRET,
    ...extraEnv,
  }
  return {home, keyringFile, env}
}

export function profilesPath(home: string): string {
  return join(home, '.config', 'intelligrc', 'profiles.json')
}

export function readProfiles(home: string): {profiles: Record<string, Record<string, unknown>>} {
  return JSON.parse(readFileSync(profilesPath(home), 'utf8'))
}

/** The fake keyring's stored entries. A missing file reads as empty. */
export function readKeyring(ctx: AuthContext): Record<string, string> {
  if (!existsSync(ctx.keyringFile)) {
    return {}
  }

  return JSON.parse(readFileSync(ctx.keyringFile, 'utf8'))
}

export interface CreateProfileOptions {
  tenantId?: string
  tenantName?: string
}

/** Create one profile through a real headless login against the fake API. */
export async function createProfile(
  api: FakeApi,
  ctx: AuthContext,
  name: string,
  options: CreateProfileOptions = {},
): Promise<void> {
  api.enqueueTenants([
    {id: options.tenantId ?? `tenant-${name}`, name: options.tenantName ?? `Tenant ${name}`},
  ])
  const result = await runCli(
    [
      'auth',
      'login',
      '--profile',
      name,
      '--client-id',
      `client-${name}`,
      '--client-secret-env',
      'TEST_CLIENT_SECRET',
      '--base-url',
      api.url,
    ],
    {home: ctx.home, env: ctx.env},
  )
  assert.equal(result.code, 0, result.stderr)
}
