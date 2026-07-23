/**
 * TEMPORARY Windows diagnosis script for the deterministic 0xC0000409
 * crash in the exhausted-429 path. Removed before merge.
 */
import {createProfile, setupAuthContext} from './helpers/auth-fixtures.ts'
import {startFakeApi} from './helpers/fake-api.ts'
import {runCli} from './helpers/run-cli.ts'

const api = await startFakeApi()
const ctx = setupAuthContext()
await createProfile(api, ctx, 'runtime')

// Variant A: exact failing-test shape.
api.enqueue({status: 429, headers: {'retry-after': '1'}, body: {message: 'slow down'}})
api.enqueue({status: 429, headers: {'retry-after': '0'}, body: {message: 'slow down'}})
api.enqueue({status: 429, headers: {'retry-after': '0'}, body: {message: 'slow down'}})
const a = await runCli(['tenant', 'list', '--profile', 'runtime'], {home: ctx.home, env: ctx.env})
console.log('A exit:', a.code)
console.log('A stdout:', JSON.stringify(a.stdout))
console.log('A stderr:', JSON.stringify(a.stderr))

// Variant B: three 429s without Retry-After (backoff path, still exit 6).
api.enqueue({status: 429, body: {message: 'slow down'}})
api.enqueue({status: 429, body: {message: 'slow down'}})
api.enqueue({status: 429, body: {message: 'slow down'}})
const b = await runCli(['tenant', 'list', '--profile', 'runtime'], {home: ctx.home, env: ctx.env})
console.log('B exit:', b.code)
console.log('B stderr:', JSON.stringify(b.stderr))

// Variant C: one 429, then success (retry-after present, exit 0).
api.enqueue({status: 429, headers: {'retry-after': '1'}, body: {message: 'slow down'}})
api.enqueue({status: 200, body: []})
const c = await runCli(['tenant', 'list', '--profile', 'runtime'], {home: ctx.home, env: ctx.env})
console.log('C exit:', c.code)
console.log('C stderr:', JSON.stringify(c.stderr))

await api.close()
