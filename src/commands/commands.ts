import {Command} from '@oclif/core'

import {buildCatalog, commandSpec} from '../manifest.js'
import {oclifFlags} from '../oclif-manifest.js'

const spec = commandSpec('commands')

export default class Commands extends Command {
  static override summary = spec.summary

  static override description =
    'Describes every command, its arguments, flags, and documented permission. ' +
    'Runs locally. Does not load a profile and does not contact a network service.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    await this.parse(Commands)
    this.log(JSON.stringify(buildCatalog(), null, 2))
  }
}
