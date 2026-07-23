import {Command, Flags} from '@oclif/core'

import {buildCatalog} from '../manifest.js'

export default class Commands extends Command {
  static override summary = 'Print the local command catalog.'

  static override description =
    'Describes every command, its arguments, flags, and documented permission. ' +
    'Runs locally. Does not load a profile and does not contact a network service.'

  static override enableJsonFlag = false

  static override flags = {
    output: Flags.string({
      summary: 'Output format.',
      options: ['json'],
      default: 'json',
    }),
  }

  async run(): Promise<void> {
    await this.parse(Commands)
    this.log(JSON.stringify(buildCatalog(), null, 2))
  }
}
