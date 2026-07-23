import {createServer, type Server} from 'node:http'

export interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
  /** Raw request body bytes as UTF-8 text. Empty string when no body was sent. */
  rawBody: string
  /**
   * The raw body parsed as JSON, or undefined when the body is empty or is
   * not valid JSON. Write-command tests assert on this parsed shape.
   */
  body?: unknown
}

export interface FakeResponse {
  status?: number
  body?: unknown
  /** Raw body string. Takes precedence over body. */
  rawBody?: string
  headers?: Record<string, string>
  /** Delay before the response is written, for client-timeout tests. */
  delayMs?: number
}

/**
 * Recording HTTP server for process-level tests. Listens on an ephemeral
 * 127.0.0.1 port. Each request pops one queued response; an empty queue
 * returns a marker 599 so a test that forgot to enqueue fails loudly.
 */
export class FakeApi {
  readonly requests: RecordedRequest[] = []
  private readonly queue: FakeResponse[] = []
  private responder?: (request: RecordedRequest) => FakeResponse
  private server!: Server
  private baseUrl!: string

  get url(): string {
    return this.baseUrl
  }

  enqueue(response: FakeResponse): void {
    this.queue.push(response)
  }

  /**
   * Fallback responder consulted when the queue is empty, before the 599
   * marker. Lets a test serve many paths without a strict response order.
   */
  respondWith(responder: (request: RecordedRequest) => FakeResponse): void {
    this.responder = responder
  }

  /** Enqueue one 200 tenant-list response. */
  enqueueTenants(tenants: Array<{id: string; name: string; createdDate?: string}>): void {
    this.enqueue({status: 200, body: tenants})
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      // Buffer the whole request body before recording, so a write test can
      // assert on the exact bytes and their parsed JSON shape.
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      req.on('end', () => {
        handle()
      })

      const handle = () => {
      const rawBody = Buffer.concat(chunks).toString('utf8')
      let parsedBody: unknown
      if (rawBody !== '') {
        try {
          parsedBody = JSON.parse(rawBody)
        } catch {
          parsedBody = undefined
        }
      }

      this.requests.push({
        method: req.method ?? '',
        path: req.url ?? '',
        headers: {...req.headers},
        rawBody,
        body: parsedBody,
      })

      const request = this.requests.at(-1)!
      const next = this.queue.shift() ??
        this.responder?.(request) ?? {
          status: 599,
          body: {error: 'fake-api-empty-queue'},
        }
      const send = () => {
        // The client may have aborted (timeout tests); a write to the
        // closed socket must not crash the fake server.
        try {
          const payload = next.rawBody ?? JSON.stringify(next.body ?? null)
          res.writeHead(next.status ?? 200, {
            'content-type': 'application/json',
            ...next.headers,
          })
          res.end(payload)
        } catch {
          // Ignored: the recorded request is what the test asserts on.
        }
      }
      if (next.delayMs) {
        setTimeout(send, next.delayMs).unref()
      } else {
        send()
      }
      }
    })

    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve)
    })
    const address = this.server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('Fake API failed to bind a TCP port.')
    }

    this.baseUrl = `http://127.0.0.1:${address.port}`
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

export async function startFakeApi(): Promise<FakeApi> {
  const api = new FakeApi()
  await api.start()
  return api
}
