import assert from 'node:assert/strict'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'

import {Config} from '@oclif/core'

import {
  CONFIG_DIRNAME,
  CONFIG_DIR_VARIABLE,
  resolveConfigDir,
} from '../src/config-dir.ts'
import {projectRoot} from './helpers/run-cli.ts'

/**
 * The rule is oclif's, so the test that matters compares against oclif
 * rather than against the rule restated. A library caller with no oclif
 * must land on the same directory the executable does, or it will not find
 * the profile a person created with `intelligrc auth login`.
 */
test('the resolved directory is the one oclif computes for this executable', async () => {
  const config = await Config.load(projectRoot)
  assert.equal(resolveConfigDir(process.env), config.configDir)
})

test('the scoped variable wins over everything else', () => {
  assert.equal(
    resolveConfigDir({
      [CONFIG_DIR_VARIABLE]: '/explicit/place',
      XDG_CONFIG_HOME: '/ignored',
      HOME: '/ignored',
    }),
    '/explicit/place',
  )
})

test('XDG_CONFIG_HOME names the base directory', () => {
  assert.equal(
    resolveConfigDir({XDG_CONFIG_HOME: '/xdg', HOME: '/home/person'}, 'linux'),
    join('/xdg', CONFIG_DIRNAME),
  )
})

test('Windows falls back to LOCALAPPDATA, and other platforms do not', () => {
  const env = {LOCALAPPDATA: 'C:\\Users\\person\\AppData\\Local', HOME: '/home/person'}
  assert.equal(
    resolveConfigDir(env, 'win32'),
    join('C:\\Users\\person\\AppData\\Local', CONFIG_DIRNAME),
  )
  assert.equal(resolveConfigDir(env, 'linux'), join('/home/person', '.config', CONFIG_DIRNAME))
})

test('an empty variable counts as unset, as it does everywhere else in this CLI', () => {
  assert.equal(
    resolveConfigDir({[CONFIG_DIR_VARIABLE]: '', XDG_CONFIG_HOME: '', HOME: '/home/person'}, 'linux'),
    join('/home/person', '.config', CONFIG_DIRNAME),
  )
})

test('with no HOME the platform home directory is used', () => {
  assert.equal(
    resolveConfigDir({}, 'linux'),
    join(homedir(), '.config', CONFIG_DIRNAME),
  )
})
