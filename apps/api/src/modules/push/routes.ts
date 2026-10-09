import { Router } from 'express'
import { z } from 'zod'
import { ah, validate } from '../../shared/http.js'
import { authenticate } from '../../middleware/auth.js'
import {
  getVapidPublicKey,
  isPushEnabled,
  registerSubscription,
  removeSubscription,
} from './sender.js'

const router = Router()
router.use(authenticate)

router.get(
  '/config',
  ah(async (_req, res) => {
    res.json({ enabled: isPushEnabled(), publicKey: getVapidPublicKey() })
  }),
)

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }),
})

router.post(
  '/subscribe',
  ah(async (req, res) => {
    if (!isPushEnabled()) {
      res.status(503).json({ error: { code: 'push_disabled', message: 'Push no esta configurado' } })
      return
    }
    const body = validate(subSchema, req.body)
    registerSubscription(req.db!, req.user!.id, body, req.headers['user-agent'])
    res.status(201).json({ ok: true })
  }),
)

router.delete(
  '/subscribe',
  ah(async (req, res) => {
    const body = validate(z.object({ endpoint: z.string().url() }), req.body)
    removeSubscription(req.db!, req.user!.id, body.endpoint)
    res.status(204).end()
  }),
)

export default router
