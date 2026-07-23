/**
 * HTTPS server with a self-signed certificate, used only to prove that the
 * CLI keeps certificate validation enabled. The committed key pair
 * (tls-test-key.pem / tls-test-cert.pem, CN "intelligrc-cli-test-only") is
 * a test fixture, not a credential: it authenticates nothing outside this
 * suite and is never trusted by any real client.
 */
import {readFileSync} from 'node:fs'
import {createServer, type Server} from 'node:https'

export interface FakeTlsApi {
  url: string
  /** Number of TLS connections that completed a handshake. */
  requestCount: () => number
  close: () => Promise<void>
}

export async function startSelfSignedTlsApi(): Promise<FakeTlsApi> {
  const key = readFileSync(new URL('tls-test-key.pem', import.meta.url))
  const cert = readFileSync(new URL('tls-test-cert.pem', import.meta.url))

  let requests = 0
  const server: Server = createServer({key, cert}, (_req, res) => {
    requests += 1
    res.writeHead(200, {'content-type': 'application/json'})
    res.end('[]')
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Fake TLS API failed to bind a TCP port.')
  }

  return {
    url: `https://127.0.0.1:${address.port}`,
    requestCount: () => requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
