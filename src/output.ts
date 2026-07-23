/**
 * Output formatter for API commands. One function turns a decoded response
 * body into the exact stdout text for the selected format:
 *
 * - "json": pretty-printed JSON that preserves documented field names and
 *   the response shape. The default format.
 * - "jsonl": one valid JSON line per array element; a non-array body is
 *   one line.
 * - "table": one padded row per array element (a non-array body is one
 *   row). Columns are the union of object keys in first-seen order.
 *   Scalars render as text, null and missing fields render empty, and
 *   nested values render as compact JSON.
 *
 * This module has no intra-src imports so tests can run it directly under
 * Node's type stripping.
 */

export type OutputFormat = 'json' | 'jsonl' | 'table'

export const OUTPUT_FORMATS: OutputFormat[] = ['json', 'jsonl', 'table']

function toRows(body: unknown): unknown[] {
  return Array.isArray(body) ? body : [body]
}

/**
 * One table cell. A non-object row lands entirely in the "value" column,
 * so a scalar array still renders as a table instead of failing.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function formatTable(body: unknown): string {
  const rows = toRows(body)
  if (rows.length === 0) {
    return ''
  }

  // Union of keys in first-seen order. A row that is not a plain object
  // contributes a shared "value" column.
  const columns: string[] = []
  for (const row of rows) {
    const keys =
      row !== null && typeof row === 'object' && !Array.isArray(row)
        ? Object.keys(row)
        : ['value']
    for (const key of keys) {
      if (!columns.includes(key)) {
        columns.push(key)
      }
    }
  }

  const lines = [columns]
  for (const row of rows) {
    const record =
      row !== null && typeof row === 'object' && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : {value: row}
    lines.push(columns.map((column) => cellText(record[column])))
  }

  const widths = columns.map((column, index) =>
    Math.max(...lines.map((line) => line[index].length)),
  )

  return lines
    .map((line) =>
      line
        .map((cell, index) => cell.padEnd(widths[index]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

export function formatOutput(body: unknown, format: OutputFormat): string {
  switch (format) {
    case 'json': {
      return JSON.stringify(body, null, 2)
    }

    case 'jsonl': {
      return Array.isArray(body)
        ? body.map((element) => JSON.stringify(element)).join('\n')
        : JSON.stringify(body)
    }

    case 'table': {
      return formatTable(body)
    }
  }
}
