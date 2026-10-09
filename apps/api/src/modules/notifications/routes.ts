import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config.js'
import type { VehicleRow } from '../../db/types.js'
import { notFound } from '../../shared/errors.js'
import { ah, validate } from '../../shared/http.js'
import { authenticate } from '../../middleware/auth.js'
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

const router = Router()
router.use(authenticate)

/** Alimenta el dashboard del cliente en una sola peticion. */
router.get(
  '/dashboard',
  ah(async (req, res) => {
    const db = req.db!
    const user = req.user!
    const clientId = user.id
    const cfg = readLoyaltyConfig(db)

    const open = listOrders(db, { clientId, status: 'open', limit: 5 })
    const history = listOrders(db, { clientId, status: 'delivered', limit: 8 })

    const vehicles = db
      .prepare<[number], VehicleRow>('SELECT * FROM vehicles WHERE client_id = ? ORDER BY plate')
      .all(clientId)

    const account = ensureAccount(db, clientId)
    const notifications = listNotifications(db, clientId, { limit: 10 })

    const completedRepairs = db
      .prepare<[number], { n: number }>(
        "SELECT COUNT(*) AS n FROM repair_orders WHERE client_id = ? AND status = 'delivered'",
      )
      .get(clientId)?.n ?? 0

    const spentCents = db
      .prepare<[number], { total: number | null }>(
        "SELECT SUM(total_cents) AS total FROM repair_orders WHERE client_id = ? AND status = 'delivered'",
      )
      .get(clientId)?.total ?? 0

    const rewards = listRedemptions(db, clientId).filter((r) => r.status === 'available')

    res.json({
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
      stats: {
        completedRepairs,
        vehicles: vehicles.length,
        spentCents,
      },
      notifications: notifications.items,
      unread: notifications.unread,
    })
  }),
)

router.get(
  '/repairs',
  ah(async (req, res) => {
    const result = listOrders(req.db!, { clientId: req.user!.id, limit: Number(req.query.limit) || 50 })
    res.json(result)
  }),
)

router.get(
  '/vehicles',
  ah(async (req, res) => {
    const rows = req.db!
      .prepare<[number], VehicleRow>(
        `SELECT v.*, (
           SELECT COUNT(*) FROM repair_orders o WHERE o.vehicle_id = v.id
         ) AS order_count
         FROM vehicles v WHERE v.client_id = ? ORDER BY v.plate`,
      )
      .all(req.user!.id)
    res.json({ items: rows })
  }),
)

const vehicleSchema = z.object({
  plate: z.string().min(2).max(16),
  vin: z.string().min(4).max(32).optional(),
  brand: z.string().min(1).max(40),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1900).max(2100).optional(),
  mileage: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
})

router.post(
  '/vehicles',
  ah(async (req, res) => {
    const body = validate(vehicleSchema, req.body)
    const info = req.db!
      .prepare(
        `INSERT INTO vehicles (client_id, plate, vin, brand, model, year, mileage, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user!.id,
        body.plate.trim().toUpperCase(),
        body.vin ?? null,
        body.brand.trim(),
        body.model.trim(),
        body.year ?? null,
        body.mileage ?? null,
        body.notes ?? null,
      )
    res.status(201).json(
      req.db!.prepare<[], VehicleRow>('SELECT * FROM vehicles WHERE id = ?').get(Number(info.lastInsertRowid)),
    )
  }),
)

router.patch(
  '/vehicles/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const current = req.db!
      .prepare<[], VehicleRow>('SELECT * FROM vehicles WHERE id = ? AND client_id = ?')
      .get(id, req.user!.id)
    if (!current) throw notFound('Vehiculo no encontrado')

    const body = validate(vehicleSchema.partial(), req.body)
    req.db!
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
    res.json(req.db!.prepare<[], VehicleRow>('SELECT * FROM vehicles WHERE id = ?').get(id))
  }),
)

router.get(
  '/loyalty',
  ah(async (req, res) => {
    const db = req.db!
    const cfg = readLoyaltyConfig(db)
    const account = ensureAccount(db, req.user!.id)
    res.json({
      ...account,
      rewardLabel: cfg.rewardLabel,
      pointsPerRepair: cfg.pointsPerRepair,
      pointsPerReward: cfg.pointsPerReward,
      ...progressToNextReward(account, cfg),
      redemptions: listRedemptions(db, req.user!.id),
      ledger: listLedger(db, req.user!.id, 30),
    })
  }),
)

/** Canje de una recompensa: el cliente gasta una de las suyas disponibles. */
router.post(
  '/loyalty/redeem/:id',
  ah(async (req, res) => {
    const redemption = redeemReward(req.db!, req.user!.id, Number(req.params.id))
    res.json(redemption)
  }),
)

export default router

/* ------------------------------------------------------------------ */

export const notificationsRouter = Router()
notificationsRouter.use(authenticate)

notificationsRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(
      listNotifications(req.db!, req.user!.id, {
        limit: Number(req.query.limit) || 30,
        unreadOnly: req.query.unread === '1',
      }),
    )
  }),
)

notificationsRouter.patch(
  '/read-all',
  ah(async (req, res) => {
    res.json({ updated: markAllRead(req.db!, req.user!.id) })
  }),
)

notificationsRouter.patch(
  '/:id/read',
  ah(async (req, res) => {
    res.json({ ok: markRead(req.db!, req.user!.id, Number(req.params.id)) })
  }),
)
