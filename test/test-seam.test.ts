import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'

import {startFakeApi} from './helpers/fake-api.ts'
import {fakeKeyringEnv, makeIsolatedHome, projectRoot} from './helpers/run-cli.ts'

test('fake API records requests and replays queued responses', async () => {
  const api = await startFakeApi()
  try {
    api.enqueueTenants([{id: 'tenant-1', name: 'Tenant One'}])

    const response = await fetch(`${api.url}/v1/Tenants`, {
      headers: {'x-client-id': 'client-a'},
    })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body, [{id: 'tenant-1', name: 'Tenant One'}])
    assert.equal(api.requests.length, 1)
    assert.equal(api.requests[0].method, 'GET')
    assert.equal(api.requests[0].path, '/v1/Tenants')
    assert.equal(api.requests[0].headers['x-client-id'], 'client-a')
  } finally {
    await api.close()
  }
})

test('fake API returns marker status 599 when the queue is empty', async () => {
  const api = await startFakeApi()
  try {
    const response = await fetch(`${api.url}/v1/Tenants`)
    assert.equal(response.status, 599)
  } finally {
    await api.close()
  }
})

test('loader hook redirects @napi-rs/keyring to the file-backed fake in a child process', async () => {
  const home = makeIsolatedHome()
  const keyringFile = join(home, 'fake-keyring.json')

  const script = [
    "const {Entry} = await import('@napi-rs/keyring')",
    "new Entry('intelligrc-cli', 'smoke').setPassword('smoke-secret')",
  ].join('\n')

  const result = await new Promise<{code: number | null; stderr: string}>(
    (resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        cwd: projectRoot,
        env: {...process.env, ...fakeKeyringEnv(keyringFile)},
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      let stderr = ''
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.on('error', reject)
      child.on('close', (code) => resolve({code, stderr}))
    },
  )

  assert.equal(result.code, 0, result.stderr)
  const store = JSON.parse(readFileSync(keyringFile, 'utf8'))
  assert.deepEqual(store, {'intelligrc-cli\u0000smoke': 'smoke-secret'})
})
