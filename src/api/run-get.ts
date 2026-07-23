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
import {type ApiCommandSpec} from '../manifest.js'
import {formatOutput, type OutputFormat} from '../output.js'
import {apiRequest, emitRetryDiagnostic, type QueryPairs} from './client.js'
import {resolveApiContext} from './resolve.js'

/**
 * Shared help description for one documented GET operation that sends
 * the tenant header and documents a permission. The path comes from the
 * spec's operation contract.
 */
export function apiGetDescription(spec: ApiCommandSpec): string {
  return (
    `Sends one documented GET ${spec.contract.path} request with the profile ` +
    'credential and tenant. Documented permission: ' +
    `"${spec.permission}". The CLI does not check whether the selected ` +
    'profile holds that permission. Output preserves the upstream field ' +
    'names and response shape.'
  )
}

export interface ApiGetOptions {
  spec: ApiCommandSpec
  profile: string
  output: OutputFormat
  /**
   * Builds the validated query pairs. Runs before profile resolution, so
   * an invalid identifier exits 2 with zero keyring or network access.
   */
  buildQuery?: () => QueryPairs
  /**
   * Builds the request path when the documented path contains a path
   * parameter. Runs before profile resolution under the same guarantee
   * as buildQuery. When absent, the request uses the documented contract
   * path unchanged.
   */
  buildPath?: () => string
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
    const path = options.buildPath?.() ?? options.spec.contract.path

    const context = resolveApiContext(
      options.profile,
      command.config.configDir,
      process.env,
    )
    redactionValues = context.redactionValues

    const result = await apiRequest({
      baseUrl: context.baseUrl,
      path,
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
