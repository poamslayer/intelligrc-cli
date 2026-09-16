import {Command} from '@oclif/core'

import {runApiGet} from '../../api/run-get.js'
import {apiCommandSpec} from '../../manifest.js'
import {oclifFlags} from '../../oclif-manifest.js'

const spec = apiCommandSpec('tenant list')

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

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      flags,
      // No tenant header: the documented tenant-list operation has no
      // x-tenant-id header.
      sendTenantHeader: false,
    })
  }
}
