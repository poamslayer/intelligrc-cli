import assert from 'node:assert/strict'
import {test} from 'node:test'

// Direct module import works because src/output.ts has no intra-src
// imports, like src/api/retry.ts in retry.test.ts.
import {formatOutput} from '../src/output.ts'

const rows = [
  {id: 1, name: 'Alpha', nested: {a: 1}},
  {id: 2, name: 'Beta', tags: ['x', 'y']},
]

test('json output is pretty-printed and preserves field names and shape', () => {
  assert.equal(formatOutput(rows, 'json'), JSON.stringify(rows, null, 2))
  const object = {evaluationId: 7, name: 'Current'}
  assert.equal(formatOutput(object, 'json'), JSON.stringify(object, null, 2))
})

test('jsonl output prints each array element as one valid JSON line', () => {
  const lines = formatOutput(rows, 'jsonl').split('\n')
  assert.equal(lines.length, rows.length)
  assert.deepEqual(lines.map((line) => JSON.parse(line)), rows)
})

test('jsonl output prints a non-array value on one line', () => {
  const object = {evaluationId: 7, nested: {deep: true}}
  const text = formatOutput(object, 'jsonl')
  assert.ok(!text.includes('\n'))
  assert.deepEqual(JSON.parse(text), object)
})

test('jsonl output of an empty array prints nothing', () => {
  assert.equal(formatOutput([], 'jsonl'), '')
})

test('table output renders scalar fields as columns and nested values as compact JSON', () => {
  const text = formatOutput(rows, 'table')
  const lines = text.split('\n')
  // One header row plus one row per element.
  assert.equal(lines.length, 1 + rows.length)
  // Columns are the union of keys in first-seen order.
  assert.match(lines[0], /^id\s+name\s+nested\s+tags$/)
  // Scalars render as text; nested values render as compact JSON.
  assert.match(lines[1], /^1\s+Alpha\s+\{"a":1\}$/)
  assert.match(lines[2], /^2\s+Beta\s+\["x","y"\]$/)
})

test('table output renders a missing or null field as an empty cell', () => {
  const text = formatOutput([{a: 1, b: null}, {a: 2, b: 'set', c: 3}], 'table')
  const lines = text.split('\n')
  assert.match(lines[0], /^a\s+b\s+c$/)
  // Row 1 has no value in b or c: the line ends after the a cell's padding.
  assert.match(lines[1], /^1\s*$/)
  assert.match(lines[2], /^2\s+set\s+3$/)
})

test('table output renders a non-array body as one row', () => {
  const text = formatOutput({id: 9, name: 'Only'}, 'table')
  const lines = text.split('\n')
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^id\s+name$/)
  assert.match(lines[1], /^9\s+Only$/)
})

test('table output aligns columns by the widest cell', () => {
  const text = formatOutput([{name: 'A', id: 1}, {name: 'Longer', id: 22}], 'table')
  const lines = text.split('\n')
  // Every "id" cell starts at the same character offset.
  const offset = lines[0].indexOf('id')
  assert.ok(offset > 'Longer'.length)
  assert.equal(lines[1].indexOf('1'), offset)
  assert.equal(lines[2].indexOf('22'), offset)
})

test('table output of an empty array prints nothing', () => {
  assert.equal(formatOutput([], 'table'), '')
})
