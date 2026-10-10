/**
 * Servidor de desarrollo.
 *
 * Usa `node:http` con un adaptador a `fetch`, para que la app se ejercite con
 * el mismo `handleRequest` que usa el Worker. Sin esto habria dos
 * implementaciones del API y la de produccion no se probaria nunca en local.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { config } from './config.js'
import { loadNodeConfig } from './config.node.js'
import { closeDb, getDb } from './db/connection.js'
import { seed } from './db/seed.js'
import { createApp, handleRequest } from './app.js'
import { errorResponse } from './shared/http.js'

/** El cuerpo de la peticion viaja como `ReadableStream`: Node >= 18 lo provee. */
function toWeb(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

  return new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: hasBody ? (toWeb(req) as unknown as BodyInit) : undefined,
    // `Request` con cuerpo en streaming exige `duplex`; sin esto Node lanza.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit)
}

async function write(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  res.writeHead(response.status, headers)

  if (!response.body) {
    res.end()
    return
  }

  // El stream SSE no termina nunca, asi que se vuelca chunk a chunk en vez de
  // acumularlo entero en memoria.
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!res.write(Buffer.from(value))) {
      await new Promise((resolve) => res.once('drain', resolve))
    }
  }
  res.end()
}

export async function start(): Promise<void> {
  await loadNodeConfig()

  const db = await getDb()
  await seed(db)

  const app = createApp()

  const server = createServer((req, res) => {
    void (async () => {
      try {
        await write(res, await handleRequest(app, db, await toRequest(req)))
      } catch (err) {
        if (res.headersSent) {
          res.end()
          return
        }
        await write(res, errorResponse(err))
      }
    })()
  })

  server.listen(config.port, () => {
    console.log(`\n  ${config.shop.name} API`)
    console.log(`  http://localhost:${config.port}`)
    console.log(`  moneda: ${config.shop.currency}\n`)
  })

  const shutdown = () => {
    server.close()
    void closeDb().finally(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isDirectRun) {
  start().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
