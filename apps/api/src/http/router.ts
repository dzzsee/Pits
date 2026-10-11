/**
 * Router minimo sobre `fetch`, en lugar de Express.
 *
 * Express depende de `node:http` y no se empaqueta en Workers. Lo que el API
 * necesita es poco: rutas con parametros, middlewares que encadenan y helpers
 * de respuesta, asi que cabe en un archivo y evita el arrastre de dependencias.
 *
 * Un handler devuelve `Response` cuando quiere controlar la respuesta entera
 * (el stream SSE); si no, escribe con `c.json()` o `c.text()` y el router
 * construye la `Response` final.
 */
import type { Db } from '../db/connection.js'
import type { Role, UserRow } from '../db/types.js'
import { forbidden, unauthorized } from '../shared/errors.js'
import { findById, toPublicUser, verifyToken } from '../modules/auth/service.js'

type PendingBody = { data: unknown; type: 'json' | 'text' }

export interface RouteContext {
  method: string
  path: string
  params: Record<string, string>
  query: URLSearchParams
  headers: Headers
  /** Cuerpo ya parseado como JSON; vacio si la peticion no lo traia. */
  body: Record<string, unknown>
  db: Db
  user?: UserRow
  status: number
  outHeaders: Headers
  json(data: unknown, status?: number): void
  text(body: string, status?: number): void
  /** Lo que el handler quiere devolver; el router lo convierte en `Response`. */
  outgoing?: PendingBody
}

export type Handler = (c: RouteContext) => Promise<Response | void> | Response | void

interface Route {
  method: string
  segments: string[]
  handler: Handler
  middlewares: Handler[]
}

export function createContext(init: {
  request: Request
  url: URL
  params: Record<string, string>
  body: Record<string, unknown>
  db: Db
}): RouteContext {
  const { request, url, params, body, db } = init

  const c: RouteContext = {
    method: request.method.toUpperCase(),
    path: url.pathname,
    params,
    query: url.searchParams,
    headers: request.headers,
    body,
    db,
    status: 200,
    outHeaders: new Headers(),
    json(data, status) {
      c.status = status ?? c.status
      c.outHeaders.set('Content-Type', 'application/json; charset=utf-8')
      c.outgoing = { data, type: 'json' }
    },
    text(value, status) {
      c.status = status ?? c.status
      c.outHeaders.set('Content-Type', 'text/plain; charset=utf-8')
      c.outgoing = { data: value, type: 'text' }
    },
  }

  return c
}

function response(c: RouteContext): Response {
  const out = c.outgoing
  if (!out) return new Response(null, { status: c.status })
  const payload = out.type === 'json' ? JSON.stringify(out.data) : String(out.data)
  return new Response(payload, { status: c.status, headers: c.outHeaders })
}

/** `/api/repairs/:id` contra `['api','repairs','42']`. */
function match(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pattern.length; i += 1) {
    const p = pattern[i]
    const value = actual[i]
    if (p === undefined || value === undefined) return null
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(value)
      continue
    }
    if (p !== value) return null
  }
  return params
}

export class Router {
  private routes: Route[] = []
  private middlewares: Handler[] = []

  /**
   * Middleware de modulo: se aplica a las rutas registradas despues, igual
   * que `router.use()` en Express.
   */
  use(...handlers: Handler[]): this {
    this.middlewares.push(...handlers)
    return this
  }

  private add(method: string, path: string, handlers: Handler[]): this {
    const handler = handlers[handlers.length - 1]
    if (!handler) throw new Error(`La ruta ${method} ${path} no tiene handler`)
    this.routes.push({
      method,
      segments: path.split('/').filter(Boolean),
      handler,
      middlewares: handlers.slice(0, -1),
    })
    return this
  }

  get(path: string, ...handlers: Handler[]): this {
    return this.add('GET', path, handlers)
  }
  post(path: string, ...handlers: Handler[]): this {
    return this.add('POST', path, handlers)
  }
  patch(path: string, ...handlers: Handler[]): this {
    return this.add('PATCH', path, handlers)
  }
  delete(path: string, ...handlers: Handler[]): this {
    return this.add('DELETE', path, handlers)
  }

  async handle(c: RouteContext): Promise<Response | null> {
    const parts = c.path.split('/').filter(Boolean)

    for (const route of this.routes) {
      const params = match(route.segments, parts)
      if (!params || route.method !== c.method) continue

      c.params = params
      for (const mw of [...this.middlewares, ...route.middlewares]) {
        const early = await mw(c)
        if (early instanceof Response) return early
      }

      const result = await route.handler(c)
      if (result instanceof Response) return result
      return response(c)
    }
    return null
  }

  /** Si el path existe con otro metodo, el 404 correcto es 405. */
  allows(method: string, path: string): boolean {
    const parts = path.split('/').filter(Boolean)
    return this.routes.some((r) => r.method === method && match(r.segments, parts))
  }

  /**
   * Monta otro router bajo un prefijo, replicando `app.use('/api/staff', router)`
   * de Express. Los middlewares de modulo del subrouter se anteponen a sus
   * rutas, y las suyas se ejecutan antes que las del padre.
   */
  mount(prefix: string, sub: Router): this {
    for (const route of sub.routes) {
      this.routes.push({
        method: route.method,
        segments: [...prefix.split('/').filter(Boolean), ...route.segments],
        handler: route.handler,
        middlewares: [...sub.middlewares, ...route.middlewares],
      })
    }
    return this
  }
}

/* ------------------------------ Middlewares ------------------------------ */

export async function authenticate(c: RouteContext): Promise<void> {
  const header = c.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) throw unauthorized()

  const payload = await verifyToken(header.slice(7), 'access')
  // `findById` aplica los controles de `is_active`, `token_version` y sesion.
  c.user = await findById(c.db, payload.sub, payload.ver, payload.sid)
}

export function requireRole(...roles: Role[]): Handler {
  return async (c) => {
    if (!c.user) throw unauthorized()
    if (!roles.includes(c.user.role)) throw forbidden('Tu rol no tiene acceso a esta accion')
  }
}

export function currentUser(c: RouteContext) {
  if (!c.user) throw unauthorized()
  return toPublicUser(c.user)
}
