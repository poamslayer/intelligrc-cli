import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test, type TestContext} from 'node:test'

import {CliFailure} from '../dist/errors.js'
import {
  FileSecretStore,
  restoreSecret,
  type SecretStore,
} from '../dist/secret-store.js'

function configDir(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), 'intelligrc-secret-store-'))
  t.after(() => rmSync(root, {recursive: true, force: true}))
  return join(root, 'config')
}

function writeSecretsFile(directory: string, value: unknown): string {
  mkdirSync(directory, {recursive: true, mode: 0o700})
  const path = join(directory, 'secrets.json')
  writeFileSync(path, `${JSON.stringify(value)}\n`, {mode: 0o600})
  return path
}

test(
  'set creates the secrets file with mode 0600 and its directory with mode 0700',
  {skip: process.platform === 'win32'},
  (t) => {
    const directory = configDir(t)
    const store = new FileSecretStore(directory)

    store.set('acme', 'secret')

    assert.equal(statSync(directory).mode & 0o777, 0o700)
    assert.equal(statSync(store.filePath).mode & 0o777, 0o600)
  },
)

test('get returns null when the secrets file is missing', (t) => {
  const store = new FileSecretStore(configDir(t))
  assert.equal(store.get('acme'), null)
})

test(
  'get rejects a secrets file that is readable by group or others',
  {skip: process.platform === 'win32'},
  (t) => {
    const directory = configDir(t)
    const path = writeSecretsFile(directory, {secretsVersion: 1, secrets: {acme: 'secret'}})
    chmodSync(path, 0o644)

    assert.throws(
      () => new FileSecretStore(directory).get('acme'),
      (error: unknown) => error instanceof CliFailure && error.code === 'secrets-file-permissions',
    )
  },
)

test('get rejects an unsupported secrets file version', (t) => {
  const directory = configDir(t)
  writeSecretsFile(directory, {secretsVersion: 2, secrets: {acme: 'secret'}})

  assert.throws(
    () => new FileSecretStore(directory).get('acme'),
    (error: unknown) => error instanceof CliFailure && error.code === 'secret-store-failure',
  )
})

test('delete returns false when the key is missing', (t) => {
  const store = new FileSecretStore(configDir(t))
  store.set('other', 'secret')

  assert.equal(store.delete('acme'), false)
})

test('set then get round-trips a secret', (t) => {
  const store = new FileSecretStore(configDir(t))
  store.set('acme', 'secret')

  assert.equal(store.get('acme'), 'secret')
})

test('set removes the temporary file after a successful write', (t) => {
  const store = new FileSecretStore(configDir(t))
  store.set('acme', 'secret')

  assert.equal(existsSync(`${store.filePath}.tmp-${process.pid}`), false)
  assert.equal(
    (JSON.parse(readFileSync(store.filePath, 'utf8')) as {secretsVersion: number})
      .secretsVersion,
    1,
  )
})

test('restoreSecret wraps a delete failure and names the file and profile', () => {
  const store: SecretStore = {
    filePath: '/tmp/stub-secrets.json',
    get: () => null,
    set: () => {},
    delete: () => {
      throw new Error('delete failed')
    },
  }

  assert.throws(
    () => restoreSecret(store, 'acme', false, null),
    (error: unknown) => {
      assert.ok(error instanceof CliFailure)
      assert.equal(error.code, 'rollback-failed')
      assert.match(error.message, /stub-secrets\.json/)
      assert.match(error.message, /acme/)
      return true
    },
  )
})

test('restoreSecret restores the prior secret for an existing profile', () => {
  const calls: Array<{operation: string; profileName?: string; secret?: string}> = []
  const store: SecretStore = {
    filePath: '/tmp/stub-secrets.json',
    get: () => null,
    set: (profileName, secret) => calls.push({operation: 'set', profileName, secret}),
    delete: (profileName) => {
      calls.push({operation: 'delete', profileName})
      return true
    },
  }

  restoreSecret(store, 'acme', true, 'prior-secret')

  assert.deepEqual(calls, [
    {operation: 'set', profileName: 'acme', secret: 'prior-secret'},
  ])
})
