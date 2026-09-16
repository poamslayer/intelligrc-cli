import {Command} from '@oclif/core'

import {resolveOutputFormat} from '../../api/filters.js'
import {emitFailure} from '../../report.js'
import {type Identity, resolveIdentity} from '../../identity.js'
import {commandSpec} from '../../manifest.js'
import {oclifFlags} from '../../oclif-manifest.js'
import {formatOutput} from '../../output.js'

const spec = commandSpec('auth status')

export default class AuthStatus extends Command {
  static override summary = spec.summary

  static override description =
    'Runs locally. Reads the profile, the secrets file, the credentials ' +
    'file, or the environment, and never contacts a network service. Never ' +
    'prints the client secret.'

  static override enableJsonFlag = false

  static override flags = oclifFlags(spec)

  async run(): Promise<void> {
    const {flags} = await this.parse(AuthStatus)
    let identity: Identity | undefined

    try {
      identity = resolveIdentity(
        flags.profile as string | undefined,
        this.config.configDir,
        process.env,
        process.cwd(),
      )
      const body = {
        identity: {
          source: identity.source,
          profile: identity.profile ?? null,
          credentialsFile: identity.credentialsFile ?? null,
          clientId: identity.clientId,
          tenantId: identity.tenantId,
          tenantName: identity.tenantName,
          baseUrl: identity.baseUrl,
          secretSource: identity.secretSource,
          secretPresent: true,
          overrides: identity.overrides,
          expiry: null,
          permissions: null,
        },
      }
      const text = formatOutput(body, resolveOutputFormat(flags))
      if (text !== '') {
        this.log(text)
      }
    } catch (error) {
      this.exit(emitFailure(error, identity ? [identity.clientSecret] : []))
    }
  }
}
