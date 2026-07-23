/**
 * Shared command runner for the guarded API runtime. One call runs the
 * whole sequence for one documented GET operation: build the validated
 * query, resolve the profile context, send the guarded request, report a
 * retry diagnostic on stderr, and print the formatted response body on
 * stdout. Every failure becomes one redacted JSON error object on stderr
 * with the contract exit code.
 */
import {type Command} from '@oclif/core'

import {emitFailure} from '../errors.js'
import {type CommandSpec} from '../manifest.js'
import {formatOutput, type OutputFormat} from '../output.js'
import {apiRequest, emitRetryDiagnostic, type QueryPairs} from './client.js'
import {resolveApiContext} from './resolve.js'

/**
 * Shared help description for one documented GET operation that sends
 * the tenant header and documents a permission.
 */
export function apiGetDescription(spec: CommandSpec, path: string): string {
  return (
    `Sends one documented GET ${path} request with the profile ` +
    'credential and tenant. Documented permission: ' +
    `"${spec.permission}". The CLI does not check whether the selected ` +
    'profile holds that permission. Output preserves the upstream field ' +
    'names and response shape.'
  )
}

export interface ApiGetOptions {
  spec: CommandSpec
  /** Documented path, for example "/v1/Controls". */
  path: string
  profile: string
  output: OutputFormat
  /**
   * Builds the validated query pairs. Runs before profile resolution, so
   * an invalid identifier exits 2 with zero keyring or network access.
   */
  buildQuery?: () => QueryPairs
  /**
   * False only for the tenant-list operation, which documents no
   * x-tenant-id header.
   */
  sendTenantHeader: boolean
}

export async function runApiGet(command: Command, options: ApiGetOptions): Promise<void> {
  let redactionValues: string[] = []
  try {
    const query = options.buildQuery?.() ?? []

    const context = resolveApiContext(
      options.profile,
      command.config.configDir,
      process.env,
    )
    redactionValues = context.redactionValues

    const result = await apiRequest({
      baseUrl: context.baseUrl,
      path: options.path,
      query,
      clientId: context.clientId,
      clientSecret: context.clientSecret,
      tenantId: options.sendTenantHeader ? context.tenantId : undefined,
      permission: options.spec.permission,
      redactionValues,
      env: process.env,
    })

    emitRetryDiagnostic(result.attempts)
    const text = formatOutput(result.body, options.output)
    if (text !== '') {
      command.log(text)
    }
  } catch (error) {
    command.exit(emitFailure(error, redactionValues))
  }
}
