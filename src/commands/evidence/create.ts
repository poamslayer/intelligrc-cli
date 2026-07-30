import {Command} from '@oclif/core'

import {buildEvidenceLinkCreateBody} from '../../api/filters.js'
import {apiWriteDescription, runApiWrite} from '../../api/run-write.js'
import {apiCommandSpec, oclifFlags} from '../../manifest.js'
import {type OutputFormat} from '../../output.js'

const spec = apiCommandSpec('evidence create')

export default class EvidenceCreate extends Command {
  static override summary = spec.summary

  static override description =
    `${apiWriteDescription(spec, 'POST')} The documented operation creates the ` +
    'evidence with no assessment objective mappings. Use ' +
    '`evidence assessment-objectives set` to map assessment objectives after ' +
    'the evidence exists.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(EvidenceCreate)

    await runApiWrite(this, {
      spec,
      method: 'POST',
      profile: flags.profile as string,
      output: flags.output as OutputFormat,
      sendTenantHeader: true,
      buildBody: () => buildEvidenceLinkCreateBody(flags),
    })
  }
}
