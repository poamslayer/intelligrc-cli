/**
 * Manually started live suite (issue #13). Exercises the CLI against the
 * dedicated populated IntelliGRC test tenant and records compatibility
 * evidence in live-report.json.
 *
 * Not part of `npm test`: a human starts this suite deliberately, with a
 * dedicated read-only credential. The automated fake-API test
 * live-suite.test.ts drives this same runner against the local fake API,
 * so the orchestration, skip, coverage, and redaction logic is proved
 * before any live run.
 *
 * Usage: node test/live/live-suite.ts [command [args...]]
 * The command tokens name the CLI executable under test. Default: this
 * checkout's bin/run.js run with the current Node.js executable.
 *
 * Environment:
 * - INTELLIGRC_LIVE_CLIENT_ID: the read-only credential's client ID.
 * - INTELLIGRC_LIVE_CLIENT_SECRET: its client secret.
 * - INTELLIGRC_LIVE_BASE_URL: optional base URL (default
 *   https://api.intelligrc.app).
 *
 * Safety rules this runner enforces:
 * - Every CLI call is a documented read command; the runner sends no
 *   write request.
 * - The report contains command identifiers, statuses, response-shape
 *   metadata, and counts. It contains no argument values, so discovered
 *   record identifiers never reach the report.
 * - Before writing, the serialized report is scanned for the client ID,
 *   client secret, tenant identifier, and tenant name; a hit fails the
 *   run.
 * - A missing source record produces an explicit skip with a non-secret
 *   reason instead of a pass.
 */
import {spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {projectRoot, type CliResult} from '../helpers/run-cli.ts'

const DEFAULT_BASE_URL = 'https://api.intelligrc.app'
const PROFILE = `live-${randomBytes(4).toString('hex')}`
const REPORT_PATH = join(process.cwd(), 'live-report.json')

const cliCommand =
  process.argv.length > 2
    ? process.argv.slice(2)
    : [process.execPath, join(projectRoot, 'bin', 'run.js')]

interface CaseRecord {
  command: string
  status: 'pass' | 'skip' | 'fail'
  /** Non-secret reason for a skip. */
  skipReason?: string
  /** Top-level response shape metadata. Key names only, never values. */
  shape?: {kind: 'array' | 'object' | 'scalar'; itemCount?: number; keys?: string[]}
  error?: {code?: string; httpStatus?: number; retryable?: boolean; attempts?: number}
}

interface Report {
  suite: 'intelligrc-cli live suite'
  startedAt: string
  baseUrl: string
  cliVersion?: string
  cases: CaseRecord[]
  observations: {
    pagination: string[]
    redirects: string
    rateLimiting: string
    errorProbe?: {
      path: string
      status: number
      contentType: string | null
      bodyParsesAsJson: boolean
      rateLimitHeaderNames: string[]
    }
    conflicts: Array<{archived: string; observed: string; action: string}>
  }
  coverage: {
    apiCommands: number
    covered: number
    uncovered: string[]
    permissionsSampled: string[]
  }
}

/** Values that must never appear in the report. Filled during login. */
const redactionValues: string[] = []

/**
 * Abort the run. Thrown (not process.exit) so the finally block still
 * removes the throwaway profile and its saved client secret.
 */
function fail(message: string): never {
  throw new Error(message)
}

function runCli(args: string[], env: Record<string, string>): Promise<CliResult> {
  // Windows command shims (.cmd/.bat) only run through cmd.exe.
  let [command, ...prefixArgs] = cliCommand
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    prefixArgs = ['/d', '/s', '/c', command, ...prefixArgs]
    command = 'cmd.exe'
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefixArgs, ...args], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({stdout, stderr, code}))
  })
}

/**
 * Child environment: the ambient environment with isolated XDG base
 * directories (so profiles.json never touches the operator's real
 * configuration) and without the four INTELLIGRC_* override variables
 * the CLI recognizes, so only the saved profile drives requests. HOME
 * stays real because the native protected store resolves through it.
 */
function buildEnv(configHome: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }

  for (const override of [
    'INTELLIGRC_CLIENT_ID',
    'INTELLIGRC_CLIENT_SECRET',
    'INTELLIGRC_TENANT_ID',
    'INTELLIGRC_BASE_URL',
  ]) {
    delete env[override]
  }

  env.XDG_CONFIG_HOME = join(configHome, '.config')
  env.XDG_DATA_HOME = join(configHome, '.local', 'share')
  env.XDG_CACHE_HOME = join(configHome, '.cache')
  return env
}

function parseStderrError(result: CliResult): CaseRecord['error'] {
  try {
    const parsed = JSON.parse(result.stderr) as {
      error?: {code?: string; httpStatus?: number; retryable?: boolean; attempts?: number}
    }
    const error = parsed.error ?? {}
    return {
      code: error.code,
      httpStatus: error.httpStatus,
      retryable: error.retryable,
      attempts: error.attempts,
    }
  } catch {
    return {code: 'unparseable-stderr'}
  }
}

function shapeOf(body: unknown): NonNullable<CaseRecord['shape']> {
  if (Array.isArray(body)) {
    return {kind: 'array', itemCount: body.length}
  }

  if (body !== null && typeof body === 'object') {
    return {kind: 'object', keys: Object.keys(body as Record<string, unknown>).sort()}
  }

  return {kind: 'scalar'}
}

/** First item's integer or string id from a listed array, or null. */
function firstId(body: unknown): number | string | null {
  if (!Array.isArray(body) || body.length === 0) {
    return null
  }

  const item = body[0] as Record<string, unknown>
  const id = item.id
  return typeof id === 'number' || typeof id === 'string' ? id : null
}

interface Catalog {
  commands: Array<{id: string; kind: string; permission: string | null}>
}

/**
 * Discovered identifiers each dependent case needs. A null seed means the
 * source records do not exist in the test tenant, so the dependent case
 * skips with the seed's non-secret description.
 */
interface Seeds {
  [name: string]: {value: number | string | null; missingReason: string}
}

async function main(): Promise<void> {
  const clientId = process.env.INTELLIGRC_LIVE_CLIENT_ID
  const clientSecret = process.env.INTELLIGRC_LIVE_CLIENT_SECRET
  const baseUrl = process.env.INTELLIGRC_LIVE_BASE_URL ?? DEFAULT_BASE_URL
  if (!clientId || !clientSecret) {
    fail(
      'INTELLIGRC_LIVE_CLIENT_ID and INTELLIGRC_LIVE_CLIENT_SECRET must be set. ' +
        'The live suite does not run without the dedicated read-only credential.',
    )
  }

  redactionValues.push(clientId, clientSecret)

  const configHome = mkdtempSync(join(tmpdir(), 'intelligrc-live-'))
  const env = buildEnv(configHome)

  const report: Report = {
    suite: 'intelligrc-cli live suite',
    startedAt: new Date().toISOString(),
    baseUrl,
    cases: [],
    observations: {
      pagination: [],
      redirects: 'no redirect observed on any command',
      rateLimiting: 'no rate limiting observed on any command',
      conflicts: [],
    },
    coverage: {apiCommands: 0, covered: 0, uncovered: [], permissionsSampled: []},
  }

  let loginSucceeded = false
  try {
    // Version evidence for reproducibility.
    const version = await runCli(['version'], env)
    if (version.code === 0) {
      report.cliVersion = version.stdout.trim()
    }

    // Login: the CLI itself enforces exactly-one-tenant discovery.
    const login = await runCli(
      [
        'auth',
        'login',
        '--profile',
        PROFILE,
        '--client-id',
        clientId,
        '--client-secret-env',
        'INTELLIGRC_LIVE_CLIENT_SECRET',
        '--base-url',
        baseUrl,
      ],
      env,
    )
    if (login.code !== 0) {
      report.cases.push({command: 'auth login', status: 'fail', error: parseStderrError(login)})
      fail(
        'Live login failed: tenant discovery did not return exactly one ' +
          `tenant or the credential was rejected (exit ${login.code}). ` +
          'No live case ran.',
      )
    }

    loginSucceeded = true
    const loginOutput = JSON.parse(login.stdout) as {tenantId?: string; tenantName?: string}
    for (const value of [loginOutput.tenantId, loginOutput.tenantName]) {
      if (value) {
        redactionValues.push(value)
      }
    }

    report.cases.push({command: 'auth login', status: 'pass'})

    // Doctor: profile completeness, secret access, transport rule,
    // tenant-list access, and tenant agreement.
    const doctor = await runCli(['doctor', '--profile', PROFILE], env)
    report.cases.push(
      doctor.code === 0
        ? {command: 'doctor', status: 'pass'}
        : {command: 'doctor', status: 'fail', error: parseStderrError(doctor)},
    )

    // The offline catalog drives coverage: every API command must end the
    // run with exactly one case record.
    const catalogResult = await runCli(['commands', '--output', 'json'], env)
    if (catalogResult.code !== 0) {
      fail('The command catalog is unavailable, so coverage cannot be proved.')
    }

    const catalog = JSON.parse(catalogResult.stdout) as Catalog
    // The live suite is read-only by design: it must never send a write
    // request to the live tenant. Coverage is therefore scoped to read
    // commands. A write command carries a ": Write" permission, so it is
    // excluded here and never turned into a case. Read commands carry a
    // ": Read" permission, and the tenant-list command carries none.
    const apiCommands = catalog.commands.filter(
      (command) =>
        command.kind === 'api' &&
        (command.permission === null || !command.permission.endsWith(': Write')),
    )
    report.coverage.apiCommands = apiCommands.length

    const seeds: Seeds = {
      evaluationId: {value: null, missingReason: 'no current evaluation in the test tenant'},
      assessmentObjectiveId: {
        value: null,
        missingReason: 'no assessment objective in the test tenant',
      },
      evidenceFolderId: {value: null, missingReason: 'no evidence folder in the test tenant'},
      dataTypeId: {value: null, missingReason: 'no data type in the test tenant'},
      facilityId: {value: null, missingReason: 'no facility in the test tenant'},
      interconnectionId: {value: null, missingReason: 'no interconnection in the test tenant'},
      personnelId: {value: null, missingReason: 'no personnel record in the test tenant'},
      iclVersionId: {
        value: null,
        missingReason: 'no Intelligent Control Library version in the test tenant',
      },
    }

    /**
     * One case per documented API command, in dependency order: seed
     * producers run before their consumers. `needs` names the seeds the
     * argv requires; a null seed value turns the case into a skip.
     */
    const cases: Array<{
      command: string
      needs?: string[]
      extraArgs?: (seeds: Seeds) => string[]
      harvest?: (body: unknown) => void
    }> = [
      {command: 'tenant list'},
      {
        command: 'evaluation current',
        harvest: (body) => {
          const id = (body as Record<string, unknown> | null)?.id
          if (typeof id === 'number' || typeof id === 'string') {
            seeds.evaluationId.value = id
          }
        },
      },
      {command: 'evaluation list'},
      {
        command: 'assessment-objective list',
        needs: ['evaluationId'],
        extraArgs: (s) => ['--evaluation-id', String(s.evaluationId.value)],
        harvest: (body) => {
          seeds.assessmentObjectiveId.value = firstId(body)
        },
      },
      {
        command: 'assessment-objective history',
        needs: ['assessmentObjectiveId', 'evaluationId'],
        extraArgs: (s) => [
          '--assessment-objective-id',
          String(s.assessmentObjectiveId.value),
          '--evaluation-id',
          String(s.evaluationId.value),
        ],
      },
      {
        command: 'control list',
        needs: ['evaluationId'],
        extraArgs: (s) => ['--evaluation-id', String(s.evaluationId.value)],
      },
      {command: 'evidence list'},
      {
        command: 'evidence list',
        needs: ['evaluationId'],
        extraArgs: (s) => ['--evaluation-id', String(s.evaluationId.value)],
      },
      {
        command: 'evidence-folder list',
        harvest: (body) => {
          seeds.evidenceFolderId.value = firstId(body)
        },
      },
      {
        command: 'action-plan-project list',
        needs: ['evaluationId'],
        extraArgs: (s) => [
          '--evaluation-id',
          String(s.evaluationId.value),
          '--include-tasks',
          'true',
          '--include-subtasks',
          'true',
        ],
      },
      {
        command: 'action-plan-task list',
        needs: ['evaluationId'],
        extraArgs: (s) => [
          '--evaluation-id',
          String(s.evaluationId.value),
          '--include-subtasks',
          'true',
        ],
      },
      {
        command: 'action-plan-subtask list',
        needs: ['evaluationId'],
        extraArgs: (s) => ['--evaluation-id', String(s.evaluationId.value)],
      },
      {command: 'boundary list'},
      {
        command: 'data-type list',
        harvest: (body) => {
          seeds.dataTypeId.value = firstId(body)
        },
      },
      {
        command: 'data-type get',
        needs: ['dataTypeId'],
        extraArgs: (s) => [String(s.dataTypeId.value)],
      },
      {
        command: 'facility list',
        harvest: (body) => {
          seeds.facilityId.value = firstId(body)
        },
      },
      {command: 'facility get', needs: ['facilityId'], extraArgs: (s) => [String(s.facilityId.value)]},
      {
        command: 'facility data-types get',
        needs: ['facilityId'],
        extraArgs: (s) => [String(s.facilityId.value)],
      },
      {
        command: 'interconnection list',
        harvest: (body) => {
          seeds.interconnectionId.value = firstId(body)
        },
      },
      {
        command: 'interconnection get',
        needs: ['interconnectionId'],
        extraArgs: (s) => [String(s.interconnectionId.value)],
      },
      {
        command: 'interconnection data-types get',
        needs: ['interconnectionId'],
        extraArgs: (s) => [String(s.interconnectionId.value)],
      },
      {
        command: 'personnel list',
        harvest: (body) => {
          seeds.personnelId.value = firstId(body)
        },
      },
      {
        command: 'personnel get',
        needs: ['personnelId'],
        extraArgs: (s) => [String(s.personnelId.value)],
      },
      {command: 'lookup action-plan project-statuses'},
      {command: 'lookup action-plan task-statuses'},
      {command: 'lookup action-plan subtask-statuses'},
      {command: 'lookup action-plan task-types'},
      {command: 'lookup action-plan levels-of-effort'},
      {command: 'lookup action-plan priority-levels'},
      {command: 'lookup action-plan categories'},
      {command: 'lookup action-plan subcategories'},
      {command: 'lookup assessment-objective statuses'},
      {command: 'lookup boundary operational-statuses'},
      {command: 'lookup boundary information-system-types'},
      {command: 'lookup boundary confidentiality-levels'},
      {command: 'lookup boundary integrity-levels'},
      {command: 'lookup boundary availability-levels'},
      {command: 'lookup data-type confidentiality-levels'},
      {command: 'lookup data-type integrity-levels'},
      {command: 'lookup data-type availability-levels'},
      {command: 'lookup facility types'},
      {command: 'lookup facility states'},
      {command: 'lookup facility data-types'},
      {command: 'lookup facility asset-categories'},
      {command: 'lookup interconnection types'},
      {command: 'lookup interconnection authorization-types'},
      {command: 'lookup interconnection asset-categories'},
      {
        command: 'lookup icl-version list',
        harvest: (body) => {
          seeds.iclVersionId.value = firstId(body)
        },
      },
      {command: 'lookup icl-version latest-frameworks'},
      {
        command: 'lookup icl-version frameworks',
        needs: ['iclVersionId'],
        extraArgs: (s) => ['--icl-version-id', String(s.iclVersionId.value)],
      },
    ]

    // Coverage self-check part 1: the case list must name every API
    // command in the catalog, so catalog growth forces suite growth.
    const caseIds = new Set(cases.map((c) => c.command))
    report.coverage.uncovered = apiCommands
      .map((command) => command.id)
      .filter((id) => !caseIds.has(id))
    report.coverage.covered = report.coverage.apiCommands - report.coverage.uncovered.length

    const permissionsSampled = new Set<string>()

    for (const liveCase of cases) {
      const missing = (liveCase.needs ?? []).find((need) => seeds[need].value === null)
      if (missing) {
        report.cases.push({
          command: liveCase.command,
          status: 'skip',
          skipReason: seeds[missing].missingReason,
        })
        continue
      }

      const args = [
        ...liveCase.command.split(' '),
        ...(liveCase.extraArgs?.(seeds) ?? []),
        '--profile',
        PROFILE,
      ]
      const result = await runCli(args, env)

      if (result.code !== 0) {
        const error = parseStderrError(result)
        report.cases.push({command: liveCase.command, status: 'fail', error})
        if (error?.httpStatus === 429) {
          report.observations.rateLimiting = 'HTTP 429 observed; see the failing case'
        }

        if (error?.code?.startsWith('redirect-')) {
          report.observations.redirects = `redirect failure observed: ${error.code}`
        }

        continue
      }

      let body: unknown = null
      try {
        body = JSON.parse(result.stdout) as unknown
      } catch {
        report.cases.push({
          command: liveCase.command,
          status: 'fail',
          error: {code: 'stdout-not-json'},
        })
        continue
      }

      liveCase.harvest?.(body)
      const shape = shapeOf(body)
      report.cases.push({command: liveCase.command, status: 'pass', shape})

      const catalogEntry = apiCommands.find((command) => command.id === liveCase.command)
      if (catalogEntry?.permission) {
        permissionsSampled.add(catalogEntry.permission)
      }

      if (shape.kind === 'object' && shape.keys) {
        const paginationKeys = shape.keys.filter((key) =>
          /page|cursor|next|total|limit|offset/i.test(key),
        )
        if (paginationKeys.length > 0) {
          report.observations.pagination.push(
            `${liveCase.command}: possible pagination fields ${paginationKeys.join(', ')}`,
          )
        }
      }
    }

    if (report.observations.pagination.length === 0) {
      report.observations.pagination.push(
        'no pagination envelope or pagination field observed on any response',
      )
    }

    report.coverage.permissionsSampled = [...permissionsSampled].sort()

    // Credential-free error probe: records the observed error content
    // type and rate-limit header names without any credential material.
    try {
      const probe = await fetch(new URL('/v1/Tenants', baseUrl), {redirect: 'manual'})
      const contentType = probe.headers.get('content-type')
      const bodyText = await probe.text()
      let bodyParsesAsJson = false
      try {
        JSON.parse(bodyText)
        bodyParsesAsJson = true
      } catch {
        // Not JSON; recorded as observed.
      }

      report.observations.errorProbe = {
        path: '/v1/Tenants (credential-free)',
        status: probe.status,
        contentType,
        bodyParsesAsJson,
        rateLimitHeaderNames: [...probe.headers.keys()].filter((name) =>
          /rate|limit|retry/i.test(name),
        ),
      }

      if (probe.status >= 300 && probe.status < 400) {
        report.observations.redirects = `credential-free probe redirected with HTTP ${probe.status}`
      }

      if (bodyParsesAsJson && contentType?.startsWith('text/plain')) {
        report.observations.conflicts.push({
          archived: 'The archived contract documents no error content type.',
          observed: 'A JSON-formatted error body arrived labeled text/plain.',
          action:
            'Preserve both pieces of evidence and open a documentation issue; ' +
            'do not rewrite the archived contract.',
        })
      }
    } catch {
      report.observations.errorProbe = undefined
    }
  } finally {
    if (loginSucceeded) {
      // Remove the live profile and its saved client secret.
      await runCli(['auth', 'remove', '--profile', PROFILE], env).catch(() => null)
    }
  }

  // Redaction gate: the serialized report must not contain any credential
  // or tenant value.
  const serialized = JSON.stringify(report, null, 2)
  for (const value of redactionValues) {
    if (value && serialized.includes(value)) {
      fail('The live report contains a credential or tenant value. The report was not written.')
    }
  }

  writeFileSync(REPORT_PATH, `${serialized}\n`)
  console.log(serialized)

  const failures = report.cases.filter((liveCase) => liveCase.status === 'fail')
  const skips = report.cases.filter((liveCase) => liveCase.status === 'skip')
  console.error(
    `live suite: ${report.cases.length} cases, ${failures.length} failed, ${skips.length} skipped`,
  )
  if (failures.length > 0 || report.coverage.uncovered.length > 0) {
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  // Never echo an arbitrary error object: it could carry live values.
  const message = error instanceof Error ? error.message : String(error)
  const safe = redactionValues.reduce(
    (text, value) => (value ? text.replaceAll(value, '[redacted]') : text),
    message,
  )
  console.error(`live suite failed: ${safe}`)
  process.exit(1)
})
