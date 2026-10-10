/**
 * Entry point de Cloudflare Workers.
 *
 * Sirve el API y el frontend compilado desde el mismo Worker: una sola URL, un
 * solo despliegue y sin CORS entre ambos. `wrangler` encola `apps/web/dist`
 * como assets; lo que no es asset lo ve este `fetch`.
 */
import { createApp, handleRequest } from '../app.js'
import { loadWorkerConfig } from '../config.js'
import { openD1, type D1Binding } from '../db/d1.js'
import { setHub, type RealtimeHub } from '../shared/events.js'
import { RealtimeHub as Hub } from './realtime-do.js'

/**
 * El tipo de `Env` mezcla bindings (base de datos, Durable Object, assets) y
 * secretos de texto. El indice de firma cubre los secretos; los bindings se
 * declaran aparte porque no son `string`.
 */
export interface Env {
  DB: D1Binding
  REALTIME: DurableObjectNamespace
  ASSETS: Fetcher
}

export { Hub as RealtimeHub }

let app: ReturnType<typeof createApp> | null = null

/**
 * El frontend es una SPA con enrutado del lado del cliente: al pulsar F5 en
 * `/reparaciones` el navegador pide esa ruta al Worker, que no existe como
 * asset, y sin este tratamiento el usuario aterriza en el 404 del API en
 * lugar de en la app.
 *
 * Se resuelve solo para navegaciones HTML. Un `fetch` a un asset inexistente
 * tiene que seguir devolviendo 404, no una pagina entera.
 */
function isNavigation(request: Request, url: URL): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  if (url.pathname.startsWith('/api/')) return false

  // Un `Accept: */*` de fetch() no debe resolverse contra el index; se
  // comprueba el header que los navegadores envie en una navegacion real.
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('text/html') || accept.includes('application/xhtml+xml')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Los secretos son texto; los bindings no llegan a `config`.
    loadWorkerConfig(env as unknown as Record<string, string | undefined>)

    // El hub se enlaza una vez por isolate: a partir de ahi, `emitToUser` y
    // `emitToStaff` del dominio entregan al Durable Object.
    setHub(makeHub(env.REALTIME))

    const url = new URL(request.url)

    // Rutas del frontend. Primero se deja que el binding resuelva el asset
    // (ficheros reales, con su cache); si no existe y es una navegacion, se
    // devuelve el index para que el router del cliente decida la pantalla.
    if (!url.pathname.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request)
      if (asset.status !== 404) return asset

      if (isNavigation(request, url)) {
        return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request))
      }
      return asset
    }

    app ??= createApp()
    // D1 ya viene inicializada por `wrangler d1 execute`: no hay bootstrap.
    const db = openD1(env.DB)

    // El frontend y el API comparten origen: `cors: false`.
    return handleRequest(app, db, request, { cors: false })
  },
}

function makeHub(namespace: DurableObjectNamespace): RealtimeHub {
  const stub = namespace.get(namespace.idFromName('pits')) as unknown as Hub
  return {
    open: (userId, role) => stub.open(userId, role),
    publish: (userId, event) => stub.publish(userId, event),
    publishStaff: (event) => stub.publishStaff(event),
  }
}
