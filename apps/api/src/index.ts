import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { getDb } from './db/connection.js'
import { seed } from './db/seed.js'
import { attachDb, authenticate } from './middleware/auth.js'
import authRouter from './modules/auth/routes.js'
import meRouter, { notificationsRouter } from './modules/notifications/routes.js'
import staffRouter from './modules/repairs/routes.js'
import adminRouter from './modules/admin/routes.js'
import pushRouter from './modules/push/routes.js'
import realtimeRouter from './modules/realtime/routes.js'
import { getOrderDetail } from './modules/repairs/service.js'
import { ah, errorHandler, notFoundHandler } from './shared/http.js'
import { forbidden } from './shared/errors.js'

export function createApp() {
  const app = express()
  const db = getDb()

  app.use(express.json({ limit: '256kb' }))
  app.use(cors({ origin: config.corsOrigin, credentials: true }))
  app.use(attachDb(db))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, shop: config.shop.name, currency: config.shop.currency })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/me', meRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/push', pushRouter)
  app.use('/api', realtimeRouter)
  app.use('/api/staff', staffRouter)
  app.use('/api/admin', adminRouter)

  /**
   * Detalle de una reparacion. El cliente solo accede a las suyas y sin las
   * notas internas del mecanico (staffView = false).
   */
  app.get(
    '/api/repairs/:id',
    authenticate,
    ah(async (req, res) => {
      const detail = getOrderDetail(req.db!, Number(req.params.id), {
        staffView: req.user!.role !== 'client',
      })
    if (req.user!.role === 'client' && detail.order.client_id !== req.user!.id) {
      throw forbidden()
    }
    res.json(detail)
    }),
  )

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export async function start() {
  await seed()
  const app = createApp()
  app.listen(config.port, () => {
    console.log(`\n  ${config.shop.name} API`)
    console.log(`  http://localhost:${config.port}`)
    console.log(`  moneda: ${config.shop.currency}\n`)
  })
}

const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isDirectRun) {
  start().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
