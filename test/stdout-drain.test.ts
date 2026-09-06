import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {join} from 'node:path'
import {test} from 'node:test'

import {isolatedEnv, makeIsolatedHome, projectRoot} from './helpers/run-cli.ts'

/**
 * An agent commonly pipes a command into another program that stops reading
 * early, such as `intelligrc commands | head`. The CLI must stay silent on
 * standard error when that happens: standard error carries failures and retry
 * diagnostics only, so any other text there breaks a caller that parses it.
 *
 * `commands` is the command under test because its catalog is large enough
 * that standard output cannot flush in one synchronous write. A short reply
 * flushes immediately and never exercises the drain path.
 */
test('a reader that stops early leaves nothing on stderr', async () => {
  const binPath = join(projectRoot, 'bin', 'run.js')
  const child = spawn(process.execPath, [binPath, 'commands'], {
    cwd: projectRoot,
    env: isolatedEnv(makeIsolatedHome()),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })

  // Stop reading after the first chunk, the way `head` does.
  child.stdout.once('data', () => {
    child.stdout.destroy()
  })

  await new Promise<void>((resolve) => {
    child.on('close', () => {
      resolve()
    })
  })

  assert.equal(stderr, '')
})
