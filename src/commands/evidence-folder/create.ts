import {Command} from '@oclif/core'

import {buildEvidenceFolderCreateBody} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('evidence-folder create')

export default class EvidenceFolderCreate extends Command {
  static override summary = spec.summary

  static override description =
    `${apiWriteDescription(spec, 'POST')} Omit --parent-id to create the folder ` +
    'at the root. The documented operation requires a folder name that is ' +
    'unique within its parent and replies 409 Conflict when the name is ' +
    'already taken. The command passes that reply through with the message the ' +
    'API returned.'

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
