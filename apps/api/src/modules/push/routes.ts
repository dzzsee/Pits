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

const subSchema = z.object({
  endpoint: z.string().url(),
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
  const body = validate(z.object({ endpoint: z.string().url() }), c.body)
  await removeSubscription(c.db, c.user!.id, body.endpoint)
  c.status = 204
})
