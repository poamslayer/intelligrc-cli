import assert from 'node:assert/strict'
import {test} from 'node:test'

import {startFakeApi} from './helpers/fake-api.ts'

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
