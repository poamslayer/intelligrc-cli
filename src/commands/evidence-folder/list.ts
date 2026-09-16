import {Command} from '@oclif/core'

import {type QueryPairs} from '../../api/client.js'
import {parseParentId} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {apiCommandSpec} from '../../manifest.js'
import {oclifFlags} from '../../oclif-manifest.js'

const spec = apiCommandSpec('evidence-folder list')

export default class EvidenceFolderList extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(EvidenceFolderList)

    await runApiGet(this, {
      spec,
      profile: flags.profile as string,
      flags,
      buildQuery: (): QueryPairs => {
        const parentId = flags['parent-id'] as string | undefined
        return parentId === undefined ? [] : [['parentId', parseParentId(parentId)]]
      },
      sendTenantHeader: true,
    })
  }
}
