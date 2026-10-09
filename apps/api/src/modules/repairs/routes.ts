import { Router } from 'express'
import { z } from 'zod'
import { forbidden, notFound } from '../../shared/errors.js'
import { ah, validate } from '../../shared/http.js'
import { authenticate, requireRole } from '../../middleware/auth.js'
import type { RedemptionRow, VehicleRow } from '../../db/types.js'
import {
  addItem,
  applyTransition,
  createOrder,
  getOrderDetail,
  issueInvoice,
  listOrders,
  removeItem,
  updateItem,
  updateOrder,
} from './service.js'
import { archiveState, createState, listStates, updateState } from './states.js'
import { emitToUser } from '../../shared/events.js'

const router = Router()
router.use(authenticate, requireRole('mechanic', 'admin'))

/* ------------------------------ Estados ------------------------------ */

router.get(
  '/repair-states',
  ah(async (req, res) => {
    res.json({
      items: listStates(req.db!, { includeInactive: req.query.includeInactive === '1' }),
    })
  }),
)

router.post(
  '/repair-states',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        label: z.string().min(2).max(60),
        color: z.string().optional(),
        isIncident: z.boolean().optional(),
        isTerminal: z.boolean().optional(),
      }),
      req.body,
    )
    res.status(201).json(createState(req.db!, body))
  }),
)

router.patch(
  '/repair-states/:id',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        label: z.string().min(2).max(60).optional(),
        color: z.string().optional(),
        position: z.number().int().optional(),
        isIncident: z.boolean().optional(),
        isTerminal: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    )
    res.json(updateState(req.db!, Number(req.params.id), body))
  }),
)

router.delete(
  '/repair-states/:id',
  ah(async (req, res) => {
    archiveState(req.db!, Number(req.params.id))
    res.status(204).end()
  }),
)

/* ------------------------------ Ordenes ----------------------------- */

router.get(
  '/repairs',
  ah(async (req, res) => {
    const q = req.query
    const result = listOrders(
      req.db!,
      {
        status: q.status as 'open' | undefined,
        stateId: q.stateId ? Number(q.stateId) : undefined,
        mechanicId: q.mechanicId ? Number(q.mechanicId) : undefined,
        clientId: q.clientId ? Number(q.clientId) : undefined,
        q: q.q ? String(q.q) : undefined,
        from: q.from ? String(q.from) : undefined,
        to: q.to ? String(q.to) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      },
    )
    res.json(result)
  }),
)

const createOrderSchema = z.object({
  clientId: z.number().int(),
  vehicleId: z.number().int(),
  mechanicId: z.number().int().nullable().optional(),
  clientNote: z.string().max(1000).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
})

router.post(
  '/repairs',
  ah(async (req, res) => {
    const body = validate(createOrderSchema, req.body)
    const id = createOrder(req.db!, {
      ...body,
      mechanicId: body.mechanicId ?? req.user!.id,
    })
    res.status(201).json(getOrderDetail(req.db!, id, { staffView: true }))
  }),
)

/** Clientes con sus vehiculos: el wizard de nueva orden empieza aqui. */
router.get(
  '/clients',
  ah(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : ''
    const like = `%${q}%`
    const clients = req.db!
      .prepare<[string, string], { id: number; name: string; email: string; phone: string | null }>(
        `SELECT id, name, email, phone FROM users
         WHERE role = 'client' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
         ORDER BY name LIMIT 50`,
      )
      .all(like, like, like)

    const vehicles = req.db!.prepare<[], VehicleRow>('SELECT * FROM vehicles ORDER BY plate').all()
    res.json({ items: clients.map((c) => ({ ...c, vehicles: vehicles.filter((v) => v.client_id === c.id) })) })
  }),
)

router.get(
  '/repairs/:id',
  ah(async (req, res) => {
    res.json(getOrderDetail(req.db!, Number(req.params.id), { staffView: true }))
  }),
)

const patchOrderSchema = z.object({
  mechanicId: z.number().int().nullable().optional(),
  clientNote: z.string().max(1000).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  status: z.enum(['open', 'cancelled']).optional(),
})

router.patch(
  '/repairs/:id',
  ah(async (req, res) => {
    const body = validate(patchOrderSchema, req.body)
    res.json(updateOrder(req.db!, Number(req.params.id), body))
  }),
)

/**
 * El estado lo escribe el mecanico. Si el texto no existe todavia, se crea
 * automaticamente como estado personalizado del taller.
 */
const transitionSchema = z.object({
  state: z.string().min(2, 'Escribe el estado').max(60),
  note: z.string().max(1000).nullable().optional(),
  notifyClient: z.boolean().optional().default(true),
  isClientVisible: z.boolean().optional().default(true),
  isIncident: z.boolean().optional().default(false),
})

router.post(
  '/repairs/:id/transition',
  ah(async (req, res) => {
    const body = validate(transitionSchema, req.body)
    res.json(
      applyTransition(req.db!, {
        orderId: Number(req.params.id),
        toStateLabel: body.state,
        actorId: req.user!.id,
        note: body.note ?? null,
        notifyClient: body.notifyClient,
        isClientVisible: body.isClientVisible,
        isIncident: body.isIncident,
      }),
    )
  }),
)

const itemSchema = z.object({
  kind: z.enum(['part', 'labor', 'service']),
  description: z.string().min(1).max(200),
  qty: z.number().positive().max(999),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
})

router.post(
  '/repairs/:id/items',
  ah(async (req, res) => {
    const body = validate(itemSchema, req.body)
    res.status(201).json(addItem(req.db!, Number(req.params.id), body))
  }),
)

router.patch(
  '/items/:itemId',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        description: z.string().min(1).max(200).optional(),
        qty: z.number().positive().max(999).optional(),
        unitPriceCents: z.number().int().min(0).optional(),
        status: z.enum(['pending', 'done', 'cancelled']).optional(),
      }),
      req.body,
    )
    res.json(updateItem(req.db!, Number(req.params.itemId), body))
  }),
)

router.delete(
  '/items/:itemId',
  ah(async (req, res) => {
    removeItem(req.db!, Number(req.params.itemId))
    res.status(204).end()
  }),
)

router.post(
  '/repairs/:id/invoice',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        paymentMethod: z.string().max(40).optional(),
        markPaid: z.boolean().optional().default(true),
      }),
      req.body,
    )
    res.status(201).json(issueInvoice(req.db!, Number(req.params.id), body))
  }),
)

/* --------------------------- Motoricos ------------------------------ */

router.get(
  '/mechanics',
  ah(async (req, res) => {
    const items = req.db!
      .prepare<[], { id: number; name: string; email: string }>(
        "SELECT id, name, email FROM users WHERE role IN ('mechanic','admin') AND is_active = 1 ORDER BY name",
      )
      .all()
    res.json({ items })
  }),
)

/* ----------------------------- Canjes ------------------------------- */

router.get(
  '/redemptions',
  ah(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null
    const items = req.db!
      .prepare<[string | null], RedemptionRow & { client_name: string }>(
        `SELECT r.*, u.name AS client_name FROM redemptions r
         JOIN users u ON u.id = r.client_id
         ${status ? 'WHERE r.status = ?' : ''}
         ORDER BY CASE r.status WHEN 'available' THEN 0 ELSE 1 END, r.id DESC LIMIT 200`,
      )
      .all(status)
    res.json({ items })
  }),
)

/** El cliente entrega su codigo; el taller lo marca como usado. */
router.post(
  '/redemptions/:code/redeem',
  ah(async (req, res) => {
    const code = String(req.params.code).trim().toUpperCase()
    const redemption = req.db!
      .prepare<[string], RedemptionRow>('SELECT * FROM redemptions WHERE code = ?')
      .get(code)
    if (!redemption) throw notFound('Codigo no encontrado')
    if (redemption.status !== 'available') throw forbidden('Ese codigo ya fue usado o expiro')

    req.db!
      .prepare(
        "UPDATE redemptions SET status = 'used', redeemed_at = datetime('now'), redeemed_by = ? WHERE id = ?",
      )
      .run(req.user!.id, redemption.id)

    // El cliente tiene la app abierta: que vea el canje al instante.
    emitToUser(redemption.client_id, { type: 'loyalty.updated' })

    res.json(req.db!.prepare<[number], RedemptionRow>('SELECT * FROM redemptions WHERE id = ?').get(redemption.id))
  }),
)

export default router
