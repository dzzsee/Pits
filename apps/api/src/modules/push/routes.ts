import { z } from 'zod'
import { validate } from '../../shared/http.js'
import { authenticate, Router } from '../../http/router.js'
import {
  getVapidPublicKey,
  isPushEnabled,
  registerSubscription,
  removeSubscription,
} from './sender.js'

export const pushRouter = new Router()
pushRouter.use(authenticate)

pushRouter.get('/config', (c) => {
  c.json({ enabled: isPushEnabled(), publicKey: getVapidPublicKey() })
})

/**
 * Los servicios de pushWeb Push son solo FCM, Mozilla autopush y el de Apple.
 *
 * Sin esta comprobacion, `endpoint` es una URL libre y el servidor le hace un
 * POST a donde le digan (`sendNotification` → `fetch(sub.endpoint)`). Eso es un
 * SSRF desde cualquier cuenta autenticada, incluida la de menor privilegio: el
 * atacante elige el destino y el servidor hace la peticion. Anclar el destino a
 * los tres proveedores corta el problema en el punto de entrada.
 */
const ALLOWED_ENDPOINT_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]

const ALLOWED_PROTOCOLS = ['https:']

export function isPushEndpoint(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) return false
  // Comparacion por sufijo exacto: `evil-fcm.googleapis.com` no es el host.
  return ALLOWED_ENDPOINT_HOSTS.includes(url.hostname.toLowerCase())
}

const subSchema = z.object({
  // `z.string().url()` acepta cualquier host; la lista blanca va aparte.
  endpoint: z.string().url().refine(isPushEndpoint, 'Endpoint de push no permitido'),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }),
})

pushRouter.post('/subscribe', async (c) => {
  if (!isPushEnabled()) {
    c.json({ error: { code: 'push_disabled', message: 'Push no esta configurado' } }, 503)
    return
  }
  const body = validate(subSchema, c.body)
  await registerSubscription(c.db, c.user!.id, body, c.headers.get('user-agent') ?? undefined)
  c.json({ ok: true }, 201)
})

pushRouter.delete('/subscribe', async (c) => {
  const body = validate(z.object({ endpoint: z.string().url().refine(isPushEndpoint) }), c.body)
  await removeSubscription(c.db, c.user!.id, body.endpoint)
  c.status = 204
})
