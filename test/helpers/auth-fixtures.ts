/**
 * Shared fixtures for the auth command tests: one isolated home plus
 * readers for secrets.json and profiles.json.
 */
import assert from 'node:assert/strict'
import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'

import {type FakeApi} from './fake-api.ts'
import {makeIsolatedHome, runCli} from './run-cli.ts'

export const TEST_SECRET = 'super-secret-value-123'

export interface AuthContext {
  home: string
  env: Record<string, string>
}

export function setupAuthContext(extraEnv: Record<string, string> = {}): AuthContext {
  const home = makeIsolatedHome()
  const env = {
    INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1',
    TEST_CLIENT_SECRET: TEST_SECRET,
    ...extraEnv,
  }
  return {home, env}
}

export function profilesPath(home: string): string {
  return join(home, '.config', 'intelligrc', 'profiles.json')
}

export function secretsPath(home: string): string {
  return join(home, '.config', 'intelligrc', 'secrets.json')
}

export function readProfiles(home: string): {profiles: Record<string, Record<string, unknown>>} {
  return JSON.parse(readFileSync(profilesPath(home), 'utf8'))
}

/** The stored secrets. A missing file reads as empty. */
export function readSecrets(home: string): Record<string, string> {
  const path = secretsPath(home)
  if (!existsSync(path)) {
    return {}
  }

  return (JSON.parse(readFileSync(path, 'utf8')) as {secrets: Record<string, string>})
    .secrets
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
