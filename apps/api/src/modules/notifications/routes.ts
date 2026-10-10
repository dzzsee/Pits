import { z } from 'zod'
import { config } from '../../config.js'
import type { VehicleRow } from '../../db/types.js'
import { notFound } from '../../shared/errors.js'
import { validate } from '../../shared/http.js'
import { authenticate, Router } from '../../http/router.js'
import { listNotifications, markAllRead, markRead } from './service.js'
import { listOrders } from '../repairs/service.js'
import {
  ensureAccount,
  listLedger,
  listRedemptions,
  progressToNextReward,
  readLoyaltyConfig,
  redeemReward,
} from '../loyalty/service.js'

export const meRouter = new Router()
meRouter.use(authenticate)

/** Alimenta el dashboard del cliente en una sola peticion. */
meRouter.get('/dashboard', async (c) => {
  const clientId = c.user!.id
  const cfg = await readLoyaltyConfig(c.db)

  const open = await listOrders(c.db, { clientId, status: 'open', limit: 5 })
  const history = await listOrders(c.db, { clientId, status: 'delivered', limit: 8 })

  const vehicles = await c.db
    .prepare<[number], VehicleRow>('SELECT * FROM vehicles WHERE client_id = ? ORDER BY plate')
    .all(clientId)

  const account = await ensureAccount(c.db, clientId)
  const notifications = await listNotifications(c.db, clientId, { limit: 10 })

  const completedRepairs =
    (
      await c.db
        .prepare<[number], { n: number }>(
          "SELECT COUNT(*) AS n FROM repair_orders WHERE client_id = ? AND status = 'delivered'",
        )
        .get(clientId)
    )?.n ?? 0

  const spentCents =
    (
      await c.db
        .prepare<[number], { total: number | null }>(
          "SELECT SUM(total_cents) AS total FROM repair_orders WHERE client_id = ? AND status = 'delivered'",
        )
        .get(clientId)
    )?.total ?? 0

  const rewards = (await listRedemptions(c.db, clientId)).filter((r) => r.status === 'available')

  c.json({
    shop: { name: config.shop.name, currency: config.shop.currency },
    openRepairs: open.items,
    history: history.items,
    vehicles,
    loyalty: {
      points: account.points_balance,
      lifetimePoints: account.lifetime_points,
      rewardsAvailable: account.rewards_available,
      rewardsRedeemed: account.rewards_redeemed,
      rewardLabel: cfg.rewardLabel,
      pointsPerRepair: cfg.pointsPerRepair,
      pointsPerReward: cfg.pointsPerReward,
      ...progressToNextReward(account, cfg),
      codes: rewards,
    },
    stats: { completedRepairs, vehicles: vehicles.length, spentCents },
    notifications: notifications.items,
    unread: notifications.unread,
  })
})

meRouter.get('/repairs', async (c) => {
  c.json(
    await listOrders(c.db, {
      clientId: c.user!.id,
      limit: Number(c.query.get('limit')) || 50,
    }),
  )
})

meRouter.get('/vehicles', async (c) => {
  const rows = await c.db
    .prepare<[number], VehicleRow>(
      `SELECT v.*, (
         SELECT COUNT(*) FROM repair_orders o WHERE o.vehicle_id = v.id
       ) AS order_count
       FROM vehicles v WHERE v.client_id = ? ORDER BY v.plate`,
    )
    .all(c.user!.id)
  c.json({ items: rows })
})

const vehicleSchema = z.object({
  plate: z.string().min(2).max(16),
  vin: z.string().min(4).max(32).optional(),
  brand: z.string().min(1).max(40),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1900).max(2100).optional(),
  mileage: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
})

meRouter.post('/vehicles', async (c) => {
  const body = validate(vehicleSchema, c.body)
  const info = await c.db
    .prepare(
      `INSERT INTO vehicles (client_id, plate, vin, brand, model, year, mileage, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      c.user!.id,
      body.plate.trim().toUpperCase(),
      body.vin ?? null,
      body.brand.trim(),
      body.model.trim(),
      body.year ?? null,
      body.mileage ?? null,
      body.notes ?? null,
    )
  c.json(
    await c.db
      .prepare<[number], VehicleRow>('SELECT * FROM vehicles WHERE id = ?')
      .get(Number(info.lastInsertRowid)),
    201,
  )
})

meRouter.patch('/vehicles/:id', async (c) => {
  const id = Number(c.params.id)
  const current = await c.db
    .prepare<[number], VehicleRow>('SELECT * FROM vehicles WHERE id = ? AND client_id = ?')
    .get(id, c.user!.id)
  if (!current) throw notFound('Vehiculo no encontrado')

  const body = validate(vehicleSchema.partial(), c.body)
  await c.db
    .prepare(
      `UPDATE vehicles SET plate = ?, vin = ?, brand = ?, model = ?, year = ?, mileage = ?, notes = ?,
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(
      body.plate?.toUpperCase() ?? current.plate,
      body.vin ?? current.vin,
      body.brand ?? current.brand,
      body.model ?? current.model,
      body.year ?? current.year,
      body.mileage ?? current.mileage,
      body.notes ?? current.notes,
      id,
    )
  c.json(await c.db.prepare<[number], VehicleRow>('SELECT * FROM vehicles WHERE id = ?').get(id))
})

meRouter.get('/loyalty', async (c) => {
  const cfg = await readLoyaltyConfig(c.db)
  const account = await ensureAccount(c.db, c.user!.id)
  c.json({
    ...account,
    rewardLabel: cfg.rewardLabel,
    pointsPerRepair: cfg.pointsPerRepair,
    pointsPerReward: cfg.pointsPerReward,
    ...progressToNextReward(account, cfg),
    redemptions: await listRedemptions(c.db, c.user!.id),
    ledger: await listLedger(c.db, c.user!.id, 30),
  })
})

/** Canje de una recompensa: el cliente gasta una de las suyas disponibles. */
meRouter.post('/loyalty/redeem/:id', async (c) => {
  c.json(await redeemReward(c.db, c.user!.id, Number(c.params.id)))
})

/* ------------------------------ Notificaciones ------------------------ */

export const notificationsRouter = new Router()
notificationsRouter.use(authenticate)

notificationsRouter.get('/', async (c) => {
  c.json(
    await listNotifications(c.db, c.user!.id, {
      limit: Number(c.query.get('limit')) || 30,
      unreadOnly: c.query.get('unread') === '1',
    }),
  )
})

notificationsRouter.patch('/read-all', async (c) => {
  c.json({ updated: await markAllRead(c.db, c.user!.id) })
})

notificationsRouter.patch('/:id/read', async (c) => {
  c.json({ ok: await markRead(c.db, c.user!.id, Number(c.params.id)) })
})
