import {CliFailure, EXIT} from './errors.js'

export const DEFAULT_BASE_URL = 'https://api.intelligrc.app'

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    /^127(\.\d{1,3}){3}$/.test(hostname)
  )
}

/**
 * Resolve the base URL with the issue #1 precedence order (flag, then
 * INTELLIGRC_BASE_URL, then the default) and enforce the transport rule:
 * HTTPS always; plain HTTP only for a loopback host when
 * INTELLIGRC_ALLOW_HTTP_LOCALHOST=1.
 */
export function resolveBaseUrl(
  flagValue: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  const candidate = flagValue ?? env.INTELLIGRC_BASE_URL ?? DEFAULT_BASE_URL

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new CliFailure({
      code: 'base-url-invalid',
      message: `The base URL "${candidate}" is not a valid URL.`,
      exitCode: EXIT.invalidInput,
    })
  }

  if (url.protocol === 'http:') {
    const allowed =
      isLoopbackHost(url.hostname) && env.INTELLIGRC_ALLOW_HTTP_LOCALHOST === '1'
    if (!allowed) {
      throw new CliFailure({
        code: 'base-url-requires-https',
        message:
          'The base URL must use HTTPS. Plain HTTP is allowed only for a ' +
          'loopback host when INTELLIGRC_ALLOW_HTTP_LOCALHOST=1 is set.',
        exitCode: EXIT.invalidInput,
      })
    }
  } else if (url.protocol !== 'https:') {
    throw new CliFailure({
      code: 'base-url-requires-https',
      message: `The base URL must use HTTPS, not "${url.protocol}".`,
      exitCode: EXIT.invalidInput,
    })
  }

  return candidate.replace(/\/+$/, '')
}
