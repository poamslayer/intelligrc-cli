import assert from 'node:assert/strict'
import {readdirSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'
import {test} from 'node:test'

import {projectRoot} from './helpers/run-cli.ts'

/**
 * tsc writes new output but never removes output whose source is gone. A
 * deleted module therefore keeps shipping from dist/ until the directory is
 * cleared. The published package is bin/ plus dist/, so a stale artifact
 * reaches users as dead code. It also makes the build depend on what the
 * working tree happened to hold, so a clean checkout produces a different
 * dist/ than an incremental one.
 */
test('every built module in dist has a source file in src', () => {
  const distRoot = join(projectRoot, 'dist')
  const orphans: string[] = []

  for (const entry of readdirSync(distRoot, {recursive: true, withFileTypes: true})) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) {
      continue
    }

    const built = join(entry.parentPath, entry.name)
    const source = join(projectRoot, 'src', `${relative(distRoot, built).slice(0, -3)}.ts`)
    try {
      statSync(source)
    } catch {
      orphans.push(relative(projectRoot, built))
    }
  }

  assert.deepEqual(orphans, [], `dist holds artifacts with no source: ${orphans.join(', ')}`)
})
