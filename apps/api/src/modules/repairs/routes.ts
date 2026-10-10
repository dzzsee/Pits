import { z } from 'zod'
import { forbidden, notFound } from '../../shared/errors.js'
import { validate } from '../../shared/http.js'
import { authenticate, requireRole, Router } from '../../http/router.js'
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

export const staffRouter = new Router()
staffRouter.use(authenticate, requireRole('mechanic', 'admin'))

/* ------------------------------ Estados ------------------------------ */

staffRouter.get('/repair-states', async (c) => {
  c.json({
    items: await listStates(c.db, { includeInactive: c.query.get('includeInactive') === '1' }),
  })
})

staffRouter.post('/repair-states', async (c) => {
  const body = validate(
    z.object({
      label: z.string().min(2).max(60),
      color: z.string().optional(),
      isIncident: z.boolean().optional(),
      isTerminal: z.boolean().optional(),
    }),
    c.body,
  )
  c.json(await createState(c.db, body), 201)
})

staffRouter.patch('/repair-states/:id', async (c) => {
  const body = validate(
    z.object({
      label: z.string().min(2).max(60).optional(),
      color: z.string().optional(),
      position: z.number().int().optional(),
      isIncident: z.boolean().optional(),
      isTerminal: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }),
    c.body,
  )
  c.json(await updateState(c.db, Number(c.params.id), body))
})

staffRouter.delete('/repair-states/:id', async (c) => {
  await archiveState(c.db, Number(c.params.id))
  c.status = 204
})

/* ------------------------------ Ordenes ----------------------------- */

staffRouter.get('/repairs', async (c) => {
  const q = c.query
  const num = (key: string) => (q.get(key) ? Number(q.get(key)) : undefined)

  c.json(
    await listOrders(c.db, {
      status: (q.get('status') as 'open' | undefined) ?? undefined,
      stateId: num('stateId'),
      mechanicId: num('mechanicId'),
      clientId: num('clientId'),
      q: q.get('q') ?? undefined,
      from: q.get('from') ?? undefined,
      to: q.get('to') ?? undefined,
      limit: num('limit'),
      offset: num('offset'),
    }),
  )
})

const createOrderSchema = z.object({
  clientId: z.number().int(),
  vehicleId: z.number().int(),
  mechanicId: z.number().int().nullable().optional(),
  clientNote: z.string().max(1000).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
})

staffRouter.post('/repairs', async (c) => {
  const body = validate(createOrderSchema, c.body)
  const id = await createOrder(c.db, {
    ...body,
    mechanicId: body.mechanicId ?? c.user!.id,
  })
  c.json(await getOrderDetail(c.db, id, { staffView: true }), 201)
})

/** Clientes con sus vehiculos: el wizard de nueva orden empieza aqui. */
staffRouter.get('/clients', async (c) => {
  const like = `%${c.query.get('q') ?? ''}%`
  const clients = await c.db
    .prepare<[string, string], { id: number; name: string; email: string; phone: string | null }>(
      `SELECT id, name, email, phone FROM users
       WHERE role = 'client' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
       ORDER BY name LIMIT 50`,
    )
    .all(like, like, like)

  const vehicles = await c.db.prepare<[], VehicleRow>('SELECT * FROM vehicles ORDER BY plate').all()
  c.json({
    items: clients.map((cl) => ({
      ...cl,
      vehicles: vehicles.filter((v) => v.client_id === cl.id),
    })),
  })
})

staffRouter.get('/repairs/:id', async (c) => {
  c.json(await getOrderDetail(c.db, Number(c.params.id), { staffView: true }))
})

const patchOrderSchema = z.object({
  mechanicId: z.number().int().nullable().optional(),
  clientNote: z.string().max(1000).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  status: z.enum(['open', 'cancelled']).optional(),
})

staffRouter.patch('/repairs/:id', async (c) => {
  c.json(await updateOrder(c.db, Number(c.params.id), validate(patchOrderSchema, c.body)))
})

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

staffRouter.post('/repairs/:id/transition', async (c) => {
  const body = validate(transitionSchema, c.body)
  c.json(
    await applyTransition(c.db, {
      orderId: Number(c.params.id),
      toStateLabel: body.state,
      actorId: c.user!.id,
      note: body.note ?? null,
      notifyClient: body.notifyClient,
      isClientVisible: body.isClientVisible,
      isIncident: body.isIncident,
    }),
  )
})

const itemSchema = z.object({
  kind: z.enum(['part', 'labor', 'service']),
  description: z.string().min(1).max(200),
  qty: z.number().positive().max(999),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
})

staffRouter.post('/repairs/:id/items', async (c) => {
  const body = validate(itemSchema, c.body)
  c.json(await addItem(c.db, Number(c.params.id), body), 201)
})

staffRouter.patch('/items/:itemId', async (c) => {
  const body = validate(
    z.object({
      description: z.string().min(1).max(200).optional(),
      qty: z.number().positive().max(999).optional(),
      unitPriceCents: z.number().int().min(0).optional(),
      status: z.enum(['pending', 'done', 'cancelled']).optional(),
    }),
    c.body,
  )
  c.json(await updateItem(c.db, Number(c.params.itemId), body))
})

staffRouter.delete('/items/:itemId', async (c) => {
  await removeItem(c.db, Number(c.params.itemId))
  c.status = 204
})

staffRouter.post('/repairs/:id/invoice', async (c) => {
  const body = validate(
    z.object({
      paymentMethod: z.string().max(40).optional(),
      markPaid: z.boolean().optional().default(true),
    }),
    c.body,
  )
  c.json(await issueInvoice(c.db, Number(c.params.id), body), 201)
})

/* --------------------------- Motoricos ------------------------------ */

staffRouter.get('/mechanics', async (c) => {
  c.json({
    items: await c.db
      .prepare<[], { id: number; name: string; email: string }>(
        "SELECT id, name, email FROM users WHERE role IN ('mechanic','admin') AND is_active = 1 ORDER BY name",
      )
      .all(),
  })
})

/* ----------------------------- Canjes ------------------------------- */

staffRouter.get('/redemptions', async (c) => {
  const status = c.query.get('status')
  // Igual que en /admin/users: el placeholder solo existe con filtro, asi que
  // los argumentos se pasan solo cuando corresponde.
  c.json({
    items: status
      ? await c.db
          .prepare<[string], RedemptionRow & { client_name: string }>(
            `SELECT r.*, u.name AS client_name FROM redemptions r
             JOIN users u ON u.id = r.client_id
             WHERE r.status = ?
             ORDER BY CASE r.status WHEN 'available' THEN 0 ELSE 1 END, r.id DESC LIMIT 200`,
          )
          .all(status)
      : await c.db
          .prepare<[], RedemptionRow & { client_name: string }>(
            `SELECT r.*, u.name AS client_name FROM redemptions r
             JOIN users u ON u.id = r.client_id
             ORDER BY CASE r.status WHEN 'available' THEN 0 ELSE 1 END, r.id DESC LIMIT 200`,
          )
          .all(),
  })
})

/** El cliente entrega su codigo; el taller lo marca como usado. */
staffRouter.post('/redemptions/:code/redeem', async (c) => {
  const code = (c.params.code ?? '').trim().toUpperCase()
  const redemption = await c.db
    .prepare<[string], RedemptionRow>('SELECT * FROM redemptions WHERE code = ?')
    .get(code)
  if (!redemption) throw notFound('Codigo no encontrado')
  if (redemption.status !== 'available') throw forbidden('Ese codigo ya fue usado o expiro')

  await c.db
    .prepare(
      "UPDATE redemptions SET status = 'used', redeemed_at = datetime('now'), redeemed_by = ? WHERE id = ?",
    )
    .run(c.user!.id, redemption.id)

  // El cliente tiene la app abierta: que vea el canje al instante.
  emitToUser(redemption.client_id, { type: 'loyalty.updated' })

  c.json(
    await c.db
      .prepare<[number], RedemptionRow>('SELECT * FROM redemptions WHERE id = ?')
      .get(redemption.id),
  )
})
