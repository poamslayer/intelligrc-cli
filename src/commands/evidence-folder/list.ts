import {Command} from '@oclif/core'

import {type QueryPairs} from '../../api/client.js'
import {parseParentId} from '../../api/filters.js'
import {apiGetDescription, runApiGet} from '../../api/run-get.js'
import {commandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = commandSpec('evidence-folder list')
const PATH = '/v1/Evidence/Folders'

export default class EvidenceFolderList extends Command {
  static override summary = spec.summary

  static override description = apiGetDescription(spec, PATH)

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(EvidenceFolderList)

    await runApiGet(this, {
      spec,
      path: PATH,
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      buildQuery: (): QueryPairs => {
        const parentId = flags['parent-id'] as string | undefined
        return parentId === undefined ? [] : [['parentId', parseParentId(parentId)]]
      },
      sendTenantHeader: true,
    })
  }
}
