import {Command} from '@oclif/core'

import {buildEvidenceFolderCreateBody} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('evidence-folder create')

export default class EvidenceFolderCreate extends Command {
  static override summary = spec.summary

  static override description =
    `${apiWriteDescription(spec, 'POST')} The documented operation treats a null ` +
    'parent as the root, so omit --parent-id to create the folder there. It also ' +
    'states that folder names must be unique within their parent, and it ' +
    'documents a 409 Conflict reply. The command passes that reply through with ' +
    'the message the API returned.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(EvidenceFolderCreate)

    await runApiWrite(this, {
      spec,
      method: 'POST',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
      buildBody: () => buildEvidenceFolderCreateBody(flags),
    })
  }
}
