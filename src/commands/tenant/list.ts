import {Command} from '@oclif/core'

import {apiRequest, emitRetryDiagnostic} from '../../api/client.js'
import {resolveApiContext} from '../../api/resolve.js'
import {emitFailure} from '../../errors.js'
import {commandSpec, oclifFlags} from '../../manifest.js'

const spec = commandSpec('tenant list')

export default class TenantList extends Command {
  static override summary = spec.summary

  static override description =
    'Sends one documented GET /v1/Tenants request with the profile ' +
    'credential. The operation documents no x-tenant-id header, so none is ' +
    'sent. Output preserves the upstream field names and response shape.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(TenantList)

    let redactionValues: string[] = []
    try {
      const context = resolveApiContext(
        flags.profile as string,
        this.config.configDir,
        process.env,
      )
      redactionValues = context.redactionValues

      const result = await apiRequest({
        baseUrl: context.baseUrl,
        path: '/v1/Tenants',
        clientId: context.clientId,
        clientSecret: context.clientSecret,
        // No tenantId: the documented tenant-list operation has no
        // x-tenant-id header.
        permission: spec.permission,
        redactionValues,
        env: process.env,
      })

      emitRetryDiagnostic(result.attempts)
      this.log(JSON.stringify(result.body, null, 2))
    } catch (error) {
      this.exit(emitFailure(error, redactionValues))
    }
  }
}
