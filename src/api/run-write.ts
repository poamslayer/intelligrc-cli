/**
 * Shared command runner for documented write operations, the sibling of the
 * GET runner. One call runs the whole sequence for one POST, PUT, or DELETE:
 * build the validated request body and path, run an optional confirmation,
 * resolve the profile context, send the guarded request, report a retry
 * diagnostic on stderr, and print the formatted result on stdout. Every
 * failure becomes one redacted JSON error object on stderr with the contract
 * exit code.
 *
 * Input validation (the body and path builders) and the confirmation run
 * before profile resolution, so an invalid flag or a declined delete exits
 * with zero keyring or network access, exactly like the read path.
 */
import {type Command} from '@oclif/core'

import {emitFailure} from '../errors.js'
import {type ApiCommandSpec} from '../manifest.js'
import {formatOutput, type OutputFormat} from '../output.js'
import {apiRequest, emitRetryDiagnostic, type HttpMethod, type QueryPairs} from './client.js'
import {resolveApiContext} from './resolve.js'

/**
 * Shared help description for one documented write operation. The path and
 * method come from the spec's operation contract.
 */
export function apiWriteDescription(spec: ApiCommandSpec, method: HttpMethod): string {
  return (
    `Sends one documented ${method} ${spec.contract.path} request with the ` +
    'profile credential and tenant. Documented permission: ' +
    `"${spec.permission}". The CLI does not check whether the selected ` +
    'profile holds that permission. Output preserves the upstream field ' +
    'names and response shape.'
  )
}

/**
 * Shared help description for one documented delete operation. It states the
 * write facts and then the confirmation rule every delete command follows, so
 * the two readings never drift apart.
 */
export function apiDeleteDescription(spec: ApiCommandSpec): string {
  return (
    `${apiWriteDescription(spec, 'DELETE')} Because a delete cannot be undone, ` +
    'the command pauses and asks for confirmation, defaulting to "no" on an ' +
    'empty answer. Add --yes to skip the pause. When no terminal is attached ' +
    'and --yes is absent, the command declines rather than deleting.'
  )
}

export interface ApiWriteOptions {
  spec: ApiCommandSpec
  method: HttpMethod
  profile: string
  output: OutputFormat
  sendTenantHeader: boolean
  /**
   * Builds the validated JSON request body. Runs before profile resolution,
   * so an invalid flag exits 2 with zero keyring or network access. Absent
   * for a DELETE, which carries no body.
   */
  buildBody?: () => unknown
  /**
   * Builds the request path when the documented path contains a path
   * parameter. Runs before profile resolution under the same guarantee as
   * buildBody. When absent, the request uses the contract's path unchanged.
   */
  buildPath?: () => string
  /**
   * Builds the validated query pairs when the documented operation carries a
   * query parameter. Runs before profile resolution under the same guarantee
   * as buildBody. When absent, the request sends no query string.
   */
  buildQuery?: () => QueryPairs
  /**
   * Optional confirmation for a destructive operation. Runs after input
   * validation and before profile resolution. It resolves to proceed or
   * throws a CliFailure to decline, so a declined delete sends no request.
   */
  confirm?: () => Promise<void>
  /**
   * Produces the object to print when the response carries no body (a 204
   * delete reply). Absent for create and update, which print the response
   * body the API returned.
   */
  onNoContent?: () => unknown
}

export async function runApiWrite(command: Command, options: ApiWriteOptions): Promise<void> {
  let redactionValues: string[] = []
  try {
    const body = options.buildBody?.()
    const path = options.buildPath?.() ?? options.spec.contract.path
    const query = options.buildQuery?.() ?? []

    if (options.confirm) {
      await options.confirm()
    }

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
      method: options.method,
      body,
      clientId: context.clientId,
      clientSecret: context.clientSecret,
      tenantId: options.sendTenantHeader ? context.tenantId : undefined,
      permission: options.spec.permission,
      redactionValues,
      env: process.env,
    })

    emitRetryDiagnostic(result.attempts)
    const printable = result.body === undefined ? options.onNoContent?.() ?? null : result.body
    const text = formatOutput(printable, options.output)
    if (text !== '') {
      command.log(text)
    }
  } catch (error) {
    command.exit(emitFailure(error, redactionValues))
  }
}
