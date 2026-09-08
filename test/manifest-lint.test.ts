import assert from 'node:assert/strict'
import {test} from 'node:test'

import {commandSpecs as builtCommandSpecs} from '../dist/manifest.js'
import type {
  CommandSpec,
  FlagSpec,
  OperationContract,
  RequestBodyFieldContract,
} from '../src/manifest.ts'

// The runtime value comes from the built module. The type-only import supplies
// the compile-time shape without importing the source manifest at run time.
const commandSpecs = builtCommandSpecs as CommandSpec[]

const VERBS = ['get', 'list', 'create', 'update', 'delete', 'set'] as const

const VERB_EXCEPTIONS: Record<string, string> = {
  'evaluation current':
    'Reads the current evaluation with no identifier; get takes an identifier and list returns a collection.',
  'assessment-objective history':
    'Reads a history collection for one objective from its own documented operation; list would name the wrong operation.',
}

const PAIRING_EXCEPTIONS: Record<string, string> = {
  'evidence assessment-objectives set':
    'The contract documents no read of an evidence record\'s assessment objectives.',
}

type Rule =
  | 'closed-verb-set'
  | 'summary-begins-with-verb'
  | 'association-pairing'
  | 'one-flag-one-meaning'
  | 'shared-output-flags'
  | 'lookup-names-are-stable'

interface Violation {
  id: string
  rule: Rule
  message: string
}

const SHARED_OUTPUT_FLAGS: FlagSpec[] = [
  {
    name: 'profile',
    type: 'option',
    required: false,
    summary:
      'Profile that supplies the credential, tenant, and base URL. Optional when ' +
      'INTELLIGRC_CREDENTIALS_FILE or the INTELLIGRC_CLIENT_ID, ' +
      'INTELLIGRC_CLIENT_SECRET, and INTELLIGRC_TENANT_ID variables supply the identity.',
  },
  {
    name: 'output',
    type: 'option',
    required: false,
    allowedValues: ['json', 'jsonl', 'table'],
    default: 'json',
    summary: 'Output format.',
  },
  {
    name: 'json',
    type: 'boolean',
    required: false,
    summary:
      'Print JSON, the default format. Equivalent to `--output json`. ' +
      'Cannot be combined with `--output jsonl` or `--output table`.',
  },
]

function wordsOf(id: string): string[] {
  return id.trim().split(/\s+/)
}

function isVerb(word: string): boolean {
  return VERBS.some((verb) => verb === word)
}

function violation(id: string, rule: Rule, detail: string): Violation {
  return {id, rule, message: `${id}: ${rule}: ${detail}`}
}

/** Every default and variant operation contract for one API command. */
function contractsOf(spec: CommandSpec): OperationContract[] {
  assert.ok(spec.contract, `${spec.id}: API command has no operation contract`)
  return [spec.contract, ...(spec.variants ?? []).map((variant) => variant.contract)]
}

export function closedVerbSet(specs: CommandSpec[]): Violation[] {
  const violations: Violation[] = []

  for (const spec of specs) {
    const words = wordsOf(spec.id)
    const topic = words[0]
    const word = words.at(-1) ?? ''
    if (
      spec.kind === 'api' &&
      topic !== 'lookup' &&
      !isVerb(word) &&
      !Object.hasOwn(VERB_EXCEPTIONS, spec.id)
    ) {
      violations.push(
        violation(
          spec.id,
          'closed-verb-set',
          `the last word "${word}" is not one of ${VERBS.join(', ')}`,
        ),
      )
    }
  }

  return violations
}

export function summaryBeginsWithVerb(specs: CommandSpec[]): Violation[] {
  const violations: Violation[] = []

  for (const spec of specs) {
    if (spec.kind !== 'api') continue

    const words = wordsOf(spec.id)
    const topic = words[0]
    const verb = words.at(-1) ?? ''
    let expected: string | undefined

    if (Object.hasOwn(VERB_EXCEPTIONS, spec.id)) {
      expected = 'Get'
    } else if (topic === 'lookup') {
      expected = 'List'
    } else if (isVerb(verb)) {
      expected = verb[0].toUpperCase() + verb.slice(1)
    }

    if (expected === undefined) continue

    const firstWord = spec.summary.trim().split(/\s+/)[0] ?? ''
    if (firstWord !== expected) {
      violations.push(
        violation(
          spec.id,
          'summary-begins-with-verb',
          `the first word "${firstWord}" must be "${expected}"`,
        ),
      )
    }
  }

  return violations
}

export function associationPairing(specs: CommandSpec[]): Violation[] {
  const violations: Violation[] = []
  const ids = new Set(specs.map((spec) => spec.id))

  for (const spec of specs) {
    if (spec.kind !== 'api' || Object.hasOwn(PAIRING_EXCEPTIONS, spec.id)) continue

    const words = wordsOf(spec.id)
    const verb = words.at(-1)
    if (words.length !== 3 || (verb !== 'get' && verb !== 'set')) continue

    const counterpartVerb = verb === 'get' ? 'set' : 'get'
    const counterpart = [...words.slice(0, -1), counterpartVerb].join(' ')
    if (!ids.has(counterpart)) {
      violations.push(
        violation(
          spec.id,
          'association-pairing',
          `the required counterpart "${counterpart}" does not exist`,
        ),
      )
    }
  }

  return violations
}

interface DocumentedMeaning {
  name: string
  type: string
  array: boolean
}

function documentedMeanings(
  contract: OperationContract,
  flagName: string,
): DocumentedMeaning[] {
  const parameters = contract.parameters
    .filter((parameter) => parameter.source.kind === 'flag' && parameter.source.name === flagName)
    .map((parameter) => ({name: parameter.name, type: parameter.type, array: false}))

  const fields = (contract.requestBody ?? [])
    .filter((field) => field.source.name === flagName)
    .map((field) => normalizedBodyMeaning(field))

  return [...parameters, ...fields]
}

function normalizedBodyMeaning(field: RequestBodyFieldContract): DocumentedMeaning {
  if (field.type !== 'array') {
    return {name: field.name, type: field.type, array: false}
  }

  return {
    name: field.name.endsWith('s') ? field.name.slice(0, -1) : field.name,
    type: field.items?.type ?? 'missing-item-type',
    array: true,
  }
}

interface SeenMeaning {
  id: string
  name: string
  type: string
}

interface SeenFlagShape {
  id: string
  type: FlagSpec['type']
}

interface SeenUnmappedShape {
  id: string
  multiple: boolean
}

/**
 * Repeatable identifier flags deliberately map to plural array fields on
 * create or set commands and to singular scalar parameters on list commands.
 * The rule compares the array item type and removes one trailing "s" from an
 * array field name so both forms keep the same item meaning.
 */
export function oneFlagOneMeaning(specs: CommandSpec[]): Violation[] {
  const violations: Violation[] = []
  const seenMeanings = new Map<string, SeenMeaning>()
  const seenFlagShapes = new Map<string, SeenFlagShape>()
  const seenUnmappedShapes = new Map<string, SeenUnmappedShape>()

  for (const spec of specs) {
    if (spec.kind !== 'api') continue

    const contracts = contractsOf(spec)
    for (const flag of spec.flags) {
      const firstShape = seenFlagShapes.get(flag.name)
      if (firstShape === undefined) {
        seenFlagShapes.set(flag.name, {id: spec.id, type: flag.type})
      } else if (firstShape.type !== flag.type) {
        violations.push(
          violation(
            spec.id,
            'one-flag-one-meaning',
            `--${flag.name} has flag type "${flag.type}" but it has flag type "${firstShape.type}" on "${firstShape.id}"`,
          ),
        )
      }

      const meanings = contracts.flatMap((contract) => documentedMeanings(contract, flag.name))
      if (meanings.length === 0) {
        const multiple = flag.multiple === true
        const firstUnmappedShape = seenUnmappedShapes.get(flag.name)
        if (firstUnmappedShape === undefined) {
          seenUnmappedShapes.set(flag.name, {id: spec.id, multiple})
        } else if (firstUnmappedShape.multiple !== multiple) {
          violations.push(
            violation(
              spec.id,
              'one-flag-one-meaning',
              `unmapped --${flag.name} has multiple ${multiple} but it has multiple ${firstUnmappedShape.multiple} on "${firstUnmappedShape.id}"`,
            ),
          )
        }
        continue
      }

      for (const meaning of meanings) {
        const multiple = flag.multiple === true
        if (multiple !== meaning.array) {
          violations.push(
            violation(
              spec.id,
              'one-flag-one-meaning',
              `--${flag.name} has multiple ${multiple} but maps to a ${meaning.array ? 'array' : 'scalar'} contract entry`,
            ),
          )
        }

        const firstMeaning = seenMeanings.get(flag.name)
        if (firstMeaning === undefined) {
          seenMeanings.set(flag.name, {id: spec.id, name: meaning.name, type: meaning.type})
        } else if (firstMeaning.name !== meaning.name || firstMeaning.type !== meaning.type) {
          violations.push(
            violation(
              spec.id,
              'one-flag-one-meaning',
              `--${flag.name} maps to "${meaning.name}" with type "${meaning.type}" but maps to "${firstMeaning.name}" with type "${firstMeaning.type}" on "${firstMeaning.id}"`,
            ),
          )
        }
      }
    }
  }

  return violations
}

function sameFlagDefinition(actual: FlagSpec, expected: FlagSpec): boolean {
  return (
    actual.name === expected.name &&
    actual.type === expected.type &&
    actual.required === expected.required &&
    JSON.stringify(actual.allowedValues) === JSON.stringify(expected.allowedValues) &&
    actual.default === expected.default &&
    actual.summary === expected.summary
  )
}

export function sharedOutputFlags(specs: CommandSpec[]): Violation[] {
  const violations: Violation[] = []

  for (const spec of specs) {
    if (spec.kind !== 'api') continue

    for (const expected of SHARED_OUTPUT_FLAGS) {
      const matches = spec.flags.filter((flag) => flag.name === expected.name)
      if (matches.length !== 1) {
        violations.push(
          violation(
            spec.id,
            'shared-output-flags',
            `the flag list contains ${matches.length} definitions for --${expected.name}; expected exactly one`,
          ),
        )
      } else if (!sameFlagDefinition(matches[0], expected)) {
        violations.push(
          violation(
            spec.id,
            'shared-output-flags',
            `the --${expected.name} definition does not match the shared definition`,
          ),
        )
      }
    }
  }

  return violations
}

/**
 * A lookup id has exactly three words. `list` is the only verb it may end in:
 * a lookup reads one reference collection, and the summary rule already
 * requires every lookup summary to begin with "List", so `lookup icl-version
 * list` names its operation honestly. Any other verb on a lookup would use
 * the verb rule's lookup exemption to hide a read of one record or a write.
 */
export function lookupNamesAreStable(specs: CommandSpec[]): Violation[] {
  const violations: Violation[] = []

  for (const spec of specs) {
    const words = wordsOf(spec.id)
    if (words[0] !== 'lookup') continue

    const lastWord = words.at(-1) ?? ''
    if (words.length !== 3 || (isVerb(lastWord) && lastWord !== 'list')) {
      violations.push(
        violation(
          spec.id,
          'lookup-names-are-stable',
          `a lookup id must have exactly three words and must not end with a verb other than list; found ${words.length} words ending in "${lastWord}"`,
        ),
      )
    }
  }

  return violations
}

export function lintManifest(specs: CommandSpec[]): Violation[] {
  return [
    ...closedVerbSet(specs),
    ...summaryBeginsWithVerb(specs),
    ...associationPairing(specs),
    ...oneFlagOneMeaning(specs),
    ...sharedOutputFlags(specs),
    ...lookupNamesAreStable(specs),
  ]
}

function apiSpec(id: string, overrides: Partial<CommandSpec> = {}): CommandSpec {
  return {
    id,
    summary: 'Get one test resource.',
    kind: 'api',
    permission: null,
    args: [],
    flags: SHARED_OUTPUT_FLAGS.map((flag) => ({...flag})),
    contract: {method: 'get', path: '/test', parameters: []},
    ...overrides,
  }
}

function assertSingleViolation(violations: Violation[], id: string, rule: Rule): void {
  assert.equal(violations.length, 1, violations.map((entry) => entry.message).join('\n'))
  assert.equal(violations[0].id, id)
  assert.equal(violations[0].rule, rule)
  assert.match(violations[0].message, new RegExp(`^${id}: ${rule}:`))
}

test('closed-verb-set passes over the built manifest', () => {
  const violations = closedVerbSet(commandSpecs)
  assert.deepEqual(violations, [], violations.map((entry) => entry.message).join('\n'))
})

test('closed-verb-set names a command with an unknown verb', () => {
  const specs = [apiSpec('facility show', {summary: 'Show one facility.'})]
  assertSingleViolation(closedVerbSet(specs), 'facility show', 'closed-verb-set')
})

test('summary-begins-with-verb passes over the built manifest', () => {
  const violations = summaryBeginsWithVerb(commandSpecs)
  assert.deepEqual(violations, [], violations.map((entry) => entry.message).join('\n'))
})

test('summary-begins-with-verb names a command with the wrong first word', () => {
  const specs = [apiSpec('facility get', {summary: 'Show one facility.'})]
  assertSingleViolation(
    summaryBeginsWithVerb(specs),
    'facility get',
    'summary-begins-with-verb',
  )
})

test('association-pairing passes over the built manifest', () => {
  const violations = associationPairing(commandSpecs)
  assert.deepEqual(violations, [], violations.map((entry) => entry.message).join('\n'))
})

test('association-pairing names a command without its counterpart', () => {
  const specs = [apiSpec('facility data-types get')]
  assertSingleViolation(
    associationPairing(specs),
    'facility data-types get',
    'association-pairing',
  )
})

test('one-flag-one-meaning passes over the built manifest', () => {
  const violations = oneFlagOneMeaning(commandSpecs)
  assert.deepEqual(violations, [], violations.map((entry) => entry.message).join('\n'))
})

test('one-flag-one-meaning names a command with a scalar repeatable flag', () => {
  const flag: FlagSpec = {
    name: 'evaluation-id',
    type: 'option',
    required: false,
    multiple: true,
    summary: 'Test flag.',
  }
  const specs = [
    apiSpec('evidence list', {
      summary: 'List evidence.',
      flags: [...SHARED_OUTPUT_FLAGS, flag],
      contract: {
        method: 'get',
        path: '/test',
        parameters: [
          {
            name: 'evaluationId',
            in: 'query',
            required: false,
            type: 'integer',
            source: {kind: 'flag', name: 'evaluation-id'},
          },
        ],
      },
    }),
  ]
  assertSingleViolation(oneFlagOneMeaning(specs), 'evidence list', 'one-flag-one-meaning')
})

test('shared-output-flags passes over the built manifest', () => {
  const violations = sharedOutputFlags(commandSpecs)
  assert.deepEqual(violations, [], violations.map((entry) => entry.message).join('\n'))
})

test('shared-output-flags names a command with a missing shared flag', () => {
  const specs = [apiSpec('facility get', {flags: SHARED_OUTPUT_FLAGS.slice(0, 2)})]
  assertSingleViolation(sharedOutputFlags(specs), 'facility get', 'shared-output-flags')
})

test('lookup-names-are-stable passes over the built manifest', () => {
  const violations = lookupNamesAreStable(commandSpecs)
  assert.deepEqual(violations, [], violations.map((entry) => entry.message).join('\n'))
})

test('lookup-names-are-stable names a lookup that ends in a verb other than list', () => {
  const specs = [apiSpec('lookup facility set', {summary: 'List facility types.'})]
  assertSingleViolation(
    lookupNamesAreStable(specs),
    'lookup facility set',
    'lookup-names-are-stable',
  )
})

test('lookup-names-are-stable accepts a lookup that ends in list', () => {
  const specs = [apiSpec('lookup icl-version list', {summary: 'List the versions.'})]
  assert.deepEqual(lookupNamesAreStable(specs), [])
})

test('the convention exceptions contain only the reviewed ids and reasons', () => {
  assert.deepEqual(Object.keys(VERB_EXCEPTIONS), [
    'evaluation current',
    'assessment-objective history',
  ])
  assert.deepEqual(Object.keys(PAIRING_EXCEPTIONS), ['evidence assessment-objectives set'])

  for (const reason of [...Object.values(VERB_EXCEPTIONS), ...Object.values(PAIRING_EXCEPTIONS)]) {
    assert.equal(typeof reason, 'string')
    assert.ok(reason.trim().length > 0)
  }
})
