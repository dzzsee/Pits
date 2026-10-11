import { config } from './config.js'
import type { Db } from './db/connection.js'
import { authenticate, createContext, Router } from './http/router.js'
import { errorResponse, json } from './shared/http.js'
import { authRouter } from './modules/auth/routes.js'
import { meRouter, notificationsRouter } from './modules/notifications/routes.js'
import { staffRouter } from './modules/repairs/routes.js'
import { adminRouter } from './modules/admin/routes.js'
import { pushRouter } from './modules/push/routes.js'
import { realtimeRouter } from './modules/realtime/routes.js'
import { getOrderDetail } from './modules/repairs/service.js'
import { forbidden } from './shared/errors.js'

/**
 * Un solo router para todo el API. Cada modulo se monta con su prefijo, que es
 * lo que hacia `app.use('/api/staff', staffRouter)` en Express.
 */
export function createApp(): Router {
  const router = new Router()

  router.get('/api/health', (c) => {
    c.json({ ok: true, shop: config.shop.name, currency: config.shop.currency })
  })

  router
    .mount('/api/auth', authRouter)
    .mount('/api/me', meRouter)
    .mount('/api/notifications', notificationsRouter)
    .mount('/api/push', pushRouter)
    .mount('/api/staff', staffRouter)
    .mount('/api/admin', adminRouter)
    // El stream cuelga de `/api` sin prefijo propio.
    .mount('/api', realtimeRouter)

  /**
   * Detalle de una reparacion. El cliente solo accede a las suyas y sin las
   * notas internas del mecanico (staffView = false).
   *
   * Va al final a proposito: los modulos con su propio `GET /repairs/:id` lo
   * resuelven antes, segun el rol que exija cada uno.
   */
  router.get('/api/repairs/:id', authenticate, async (c) => {
    const detail = await getOrderDetail(c.db, Number(c.params.id), {
      staffView: c.user!.role !== 'client',
    })
    if (c.user!.role === 'client' && detail.order.client_id !== c.user!.id) throw forbidden()
    c.json(detail)
  })

  return router
}

/** Tamaño maximo del cuerpo. */
const MAX_BODY_BYTES = 256 * 1024

/**
 * Lee el cuerpo acotando mientras lee.
 *
 * Antes se hacia `await request.text()` y despues se comparaba el tamaño: el
 * limite existia solo en el papel, porque el cuerpo entero ya estaba en
 * memoria cuando se rechazaba. Varios cuerpos grandes a la vez bastaban para
 * agotar la memoria del isolate antes de que la primera respuesta 413 saliera.
 *
 * Ahora se corta la lectura en cuanto se pasa del limite, y se comprueba
 * `Content-Length` antes de leer nada cuando la plataforma lo facilita.
 */
async function readJsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  // Si el cliente anuncia un tamaño grande, se rechaza sin leer. Es una pista,
  // no una garantia: si miente, el corte por trozos de abajo lo detecta.
  const announced = Number(request.headers.get('content-length'))
  if (Number.isFinite(announced) && announced > MAX_BODY_BYTES) {
    return tooLarge()
  }

  const raw = await readBounded(request)
  if (raw === null) return tooLarge()
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return json(400, { error: { code: 'bad_request', message: 'Cuerpo JSON invalido' } })
  }
}

/** Acumula el cuerpo y se detiene en cuanto supera el limite. */
async function readBounded(request: Request): Promise<string | null> {
  const body = request.body
  // Peticiones sin cuerpo, o `GET`/`HEAD` filtradas antes de llegar aqui.
  if (!body) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      // Cancelar cierra el flujo de subida: se deja de transferring en vez de
      // seguir acumulando hasta que el servidor rebase.
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

function tooLarge(): Response {
  return json(413, { error: { code: 'bad_request', message: 'Cuerpo demasiado grande' } })
}

/**
 * En desarrollo el web corre en Vite, en otro puerto, y por eso hace falta
 * CORS. En el Worker el frontend se sirve desde el mismo origen y se desactiva.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {}
  const allowed = config.corsOrigin.includes('*') || config.corsOrigin.includes(origin)
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  }
}

/**
 * Atiende una peticion. Lo usan tanto el servidor de desarrollo como el Worker,
 * para que el API tenga una sola implementacion.
 */
export async function handleRequest(
  app: Router,
  db: Db,
  request: Request,
  options: { cors?: boolean } = {},
): Promise<Response> {
  const url = new URL(request.url)
  const withCors = options.cors !== false
  const extra = withCors ? corsHeaders(request.headers.get('origin')) : {}

  const finish = (res: Response) => {
    if (!Object.keys(extra).length) return res
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(extra)) headers.set(k, v)
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }

  if (request.method === 'OPTIONS') {
    return finish(new Response(null, { status: 204 }))
  }

  const ctx = createContext({
    request,
    url,
    params: {},
    body: {},
    db,
  })

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const parsed = await readJsonBody(request)
    if (parsed instanceof Response) return finish(parsed)
    ctx.body = parsed
  }

  try {
    const hit = await app.handle(ctx)
    return finish(hit ?? json(404, { error: { code: 'not_found', message: 'Ruta no encontrada' } }))
  } catch (err) {
    return finish(errorResponse(err))
  }
}
