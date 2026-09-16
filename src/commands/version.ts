import {Command} from '@oclif/core'

import {commandSpec} from '../manifest.js'
import {oclifFlags} from '../oclif-manifest.js'

const spec = commandSpec('version')

export default class Version extends Command {
  static override summary = spec.summary

  static override description =
    'Runs locally. Does not load a profile and does not contact a network service.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    await this.parse(Version)
    this.log(this.config.version)
  }
}
