import {Command} from '@oclif/core'

export default class Version extends Command {
  static override summary = 'Print the installed package version.'

  static override description =
    'Runs locally. Does not load a profile and does not contact a network service.'

  static override enableJsonFlag = false

  async run(): Promise<void> {
    this.log(this.config.version)
  }
}
