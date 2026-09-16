import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname, join, relative, resolve} from 'node:path'
import {test} from 'node:test'

import {projectRoot} from './helpers/run-cli.ts'

/**
 * Every module reachable from the `core` export subpath, found by following
 * relative imports out of src/core/index.ts. A bare specifier stops the walk:
 * it is a dependency, not a module of this package.
 */
function coreModuleGraph(): string[] {
  const entry = join(projectRoot, 'src', 'core', 'index.ts')
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) {
      continue
    }

    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/from '(\.[^']*)'/g)) {
      // Source files import the built ".js" specifier; the source beside it
      // is the ".ts" file of the same name.
      const target = resolve(dirname(file), match[1].replace(/\.js$/, '.ts'))
      queue.push(target)
    }
  }

  return [...seen].sort()
}

/**
 * The three things the export subpath promises not to do, because all three
 * are reasonable in a command and are bugs inside a long-running server.
 * A terminal prompt blocks forever with no terminal attached, a process exit
 * takes the host down, and a working-directory lookup makes a relative path
 * mean something the caller never chose.
 */
const FORBIDDEN = [
  {pattern: /process\.exit\(/, name: 'process.exit'},
  {pattern: /process\.cwd\(/, name: 'process.cwd'},
  {pattern: /\bpromptConfirm\b|\bpromptSecret\b/, name: 'a terminal prompt'},
  {pattern: /process\.(stdout|stderr)\.write\(/, name: 'a write to a process stream'},
]

test('the core export graph prompts on no terminal, exits no process, and reads no working directory', () => {
  const offenders: string[] = []

  for (const file of coreModuleGraph()) {
    const source = readFileSync(file, 'utf8')
    for (const {pattern, name} of FORBIDDEN) {
      if (pattern.test(source)) {
        offenders.push(`${relative(projectRoot, file)} uses ${name}`)
      }
    }
  }

  assert.deepEqual(offenders, [], offenders.join('; '))
})

test('the core export graph loads no command framework', () => {
  const offenders: string[] = []

  for (const file of coreModuleGraph()) {
    const source = readFileSync(file, 'utf8')
    if (/from '@oclif\//.test(source)) {
      offenders.push(relative(projectRoot, file))
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `the core export subpath must not pull oclif in: ${offenders.join(', ')}`,
  )
})

test('the core export graph stays small', () => {
  // A deliberately low ceiling. The subpath carries semver obligations, so
  // growing it is a decision to take on purpose, which means editing this
  // number and saying why in docs/core-export.md.
  const graph = coreModuleGraph()
  assert.ok(
    graph.length <= 13,
    `the core export reaches ${graph.length} modules: ${graph
      .map((file) => relative(projectRoot, file))
      .join(', ')}`,
  )
})
