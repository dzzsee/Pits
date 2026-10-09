import { config } from '../../config.js'
import type { Db } from '../../db/connection.js'
import { nextInvoiceNumber, nextOrderCode } from '../../db/helpers.js'
import type {
  OrderItemRow,
  RepairOrderRow,
  StateEventRow,
  UserRow,
  VehicleRow,
} from '../../db/types.js'
import { badRequest, conflict, forbidden, notFound } from '../../shared/errors.js'
import { emitToStaff } from '../../shared/events.js'
import { notifyUser } from '../notifications/service.js'
import { awardForRepair } from '../loyalty/service.js'
import { resolveState } from './states.js'

/* ------------------------------------------------------------------ *
 * Lecturas
 * ------------------------------------------------------------------ */

export interface OrderDetail {
  order: RepairOrderRow & {
    state_key: string | null
    state_label: string | null
    state_color: string | null
    state_is_incident: number | null
  }
  vehicle: VehicleRow
  client: { id: number; name: string; email: string; phone: string | null }
  mechanic: { id: number; name: string } | null
  items: OrderItemRow[]
  events: StateEventRow[]
  invoice: { id: number; number: string; status: string; total_cents: number; paid_at: string | null } | null
}

const ORDER_SELECT = `
  SELECT o.*,
         s.key        AS state_key,
         s.label      AS state_label,
         s.color      AS state_color,
         s.is_incident AS state_is_incident
  FROM repair_orders o
  LEFT JOIN repair_states s ON s.id = o.state_id
`

export function getOrderDetail(db: Db, orderId: number, opts: { staffView: boolean }): OrderDetail {
  const order = db
    .prepare<[number], OrderDetail['order']>(`${ORDER_SELECT} WHERE o.id = ?`)
    .get(orderId)
  if (!order) throw notFound('Reparacion no encontrada')

  const vehicle = db
    .prepare<[number], VehicleRow>('SELECT * FROM vehicles WHERE id = ?')
    .get(order.vehicle_id)
  if (!vehicle) throw notFound('Vehiculo no encontrado')

  const client = db
    .prepare<[number], { id: number; name: string; email: string; phone: string | null }>(
      'SELECT id, name, email, phone FROM users WHERE id = ?',
    )
    .get(order.client_id)!

  const mechanic = order.mechanic_id
    ? (db
        .prepare<[number], { id: number; name: string }>('SELECT id, name FROM users WHERE id = ?')
        .get(order.mechanic_id) ?? null)
    : null

  const items = db
    .prepare<[number], OrderItemRow>('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
    .all(orderId)

  const events = db
    .prepare<[number], StateEventRow>(
      `SELECT * FROM state_events WHERE order_id = ? ${
        opts.staffView ? '' : 'AND is_client_visible = 1'
      } ORDER BY id ASC`,
    )
    .all(orderId)

  const invoice =
    db
      .prepare<[number], { id: number; number: string; status: string; total_cents: number; paid_at: string | null }>(
        'SELECT id, number, status, total_cents, paid_at FROM invoices WHERE order_id = ?',
      )
      .get(orderId) ?? null

  return { order, vehicle, client, mechanic, items, events, invoice }
}

export interface OrderListFilters {
  status?: 'open' | 'delivered' | 'cancelled'
  stateId?: number
  mechanicId?: number
  clientId?: number
  vehicleId?: number
  q?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

/**
 * Lista ordenes con filtros. El control de visibilidad (notas internas) vive
 * en `getOrderDetail`; aqui solo se filtra y pagina.
 */
export function listOrders(db: Db, filters: OrderListFilters = {}) {
  const where: string[] = []
  const values: (string | number)[] = []

  if (filters.status) {
    where.push('o.status = ?')
    values.push(filters.status)
  }
  if (filters.stateId) {
    where.push('o.state_id = ?')
    values.push(filters.stateId)
  }
  if (filters.mechanicId) {
    where.push('o.mechanic_id = ?')
    values.push(filters.mechanicId)
  }
  if (filters.clientId) {
    where.push('o.client_id = ?')
    values.push(filters.clientId)
  }
  if (filters.vehicleId) {
    where.push('o.vehicle_id = ?')
    values.push(filters.vehicleId)
  }
  if (filters.q) {
    where.push('(o.code LIKE ? OR v.plate LIKE ? OR u.name LIKE ?)')
    const like = `%${filters.q}%`
    values.push(like, like, like)
  }
  if (filters.from) {
    where.push('date(o.created_at) >= date(?)')
    values.push(filters.from)
  }
  if (filters.to) {
    where.push('date(o.created_at) <= date(?)')
    values.push(filters.to)
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = db
    .prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM repair_orders o
       JOIN vehicles v ON v.id = o.vehicle_id
       JOIN users u ON u.id = o.client_id ${clause}`,
    )
    .get(...values)!.n

  const limit = Math.min(200, Math.max(1, filters.limit ?? 50))
  const offset = Math.max(0, filters.offset ?? 0)

  const items = db
    .prepare<unknown[], RepairOrderRow & { state_label: string | null; state_color: string | null; vehicle_label: string }>(
      `SELECT o.id, o.code, o.client_id, o.vehicle_id, o.mechanic_id, o.state_id, o.status,
              o.state_changed_at, o.total_cents, o.currency, o.created_at, o.delivered_at,
              s.label AS state_label, s.color AS state_color,
              (v.plate || ' - ' || v.brand || ' ' || v.model) AS vehicle_label
       FROM repair_orders o
       JOIN vehicles v ON v.id = o.vehicle_id
       JOIN users u ON u.id = o.client_id
       LEFT JOIN repair_states s ON s.id = o.state_id
       ${clause}
       ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset)

  return { items, total, limit, offset }
}

/* ------------------------------------------------------------------ *
 * Mutaciones
 * ------------------------------------------------------------------ */

export interface CreateOrderInput {
  clientId: number
  vehicleId: number
  mechanicId?: number | null
  clientNote?: string | null
  mileage?: number | null
}

export function createOrder(db: Db, input: CreateOrderInput): number {
  const vehicle = db
    .prepare<[number, number], VehicleRow>('SELECT * FROM vehicles WHERE id = ? AND client_id = ?')
    .get(input.vehicleId, input.clientId)
  if (!vehicle) throw badRequest('El vehiculo no pertenece al cliente')

  if (input.mechanicId) assertStaff(db, input.mechanicId)

  const code = nextOrderCode(db)
  const info = db
    .prepare(
      `INSERT INTO repair_orders
         (code, client_id, vehicle_id, mechanic_id, status, client_note, mileage, currency)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
    )
    .run(code, input.clientId, input.vehicleId, input.mechanicId ?? null, input.clientNote ?? null, input.mileage ?? null, config.shop.currency)

  const orderId = Number(info.lastInsertRowid)

  const state = resolveState(db, 'Recibido')
  applyTransition(db, {
    orderId,
    toStateLabel: state.label,
    actorId: input.mechanicId ?? input.clientId,
    note: 'Vehiculo recibido en el taller',
    notifyClient: false,
    isClientVisible: true,
  })

  return orderId
}
export interface TransitionInput {
  orderId: number
  toStateLabel: string
  actorId: number
  note?: string | null
  /** Notifica al cliente (por push) de este cambio de estado. */
  notifyClient?: boolean
  /** Si es false, el evento queda oculto al cliente. */
  isClientVisible?: boolean
  isIncident?: boolean
}

export interface TransitionResult {
  orderId: number
  state: { id: number; key: string; label: string; color: string; isTerminal: number }
  eventId: number
  delivered: boolean
  pointsAwarded: number
  rewardsGranted: string[]
}

/**
 * Aplica un cambio de estado. El estado lo escribe el mecanico: si no existe,
 * se crea. Entregar el vehiculo (estado terminal) cierra la orden y otorga los
 * puntos de fidelizacion.
 */
export function applyTransition(db: Db, input: TransitionInput): TransitionResult {
  const order = db
    .prepare<[number], RepairOrderRow>('SELECT * FROM repair_orders WHERE id = ?')
    .get(input.orderId)
  if (!order) throw notFound('Reparacion no encontrada')
  if (order.status === 'cancelled') throw conflict('La reparacion esta cancelada')

  const isIncident = input.isIncident ?? false
  const state = resolveState(db, input.toStateLabel, { isIncident })
  const visible = input.isClientVisible ?? true
  const notify = input.notifyClient ?? true

  const eventId = runTransitionTx(db, {
    orderId: input.orderId,
    fromStateId: order.state_id,
    toStateId: state.id,
    stateLabel: state.label,
    stateColor: state.color,
    note: input.note ?? null,
    isIncident,
    isClientVisible: visible,
    notifyClient: notify,
    actorId: input.actorId,
  })

  const delivered = state.is_terminal === 1 && order.status !== 'delivered'
  const award = delivered
    ? awardForRepair(db, order.client_id, input.orderId)
    : { pointsAwarded: 0, rewardsGranted: [] as { code: string }[] }

  if (visible) {
    void notifyUser(db, order.client_id, {
      title: delivered ? 'Reparacion entregada' : `Estado: ${state.label}`,
      body: isIncident
        ? `Contratiempo en ${order.code}. ${input.note ?? ''}`.trim()
        : `${order.code} - ${state.label}`,
      kind: isIncident ? 'incident' : 'state',
      orderId: input.orderId,
    })
  } else {
    // Cambio interno: el cliente no se entera, pero el taller debe verlo.
    emitToStaff({ type: 'order.updated', orderId: input.orderId })
  }

  return {
    orderId: input.orderId,
    state: {
      id: state.id,
      key: state.key,
      label: state.label,
      color: state.color,
      isTerminal: state.is_terminal,
    },
    eventId,
    delivered,
    pointsAwarded: award.pointsAwarded,
    rewardsGranted: award.rewardsGranted.map((r) => r.code),
  }
}

function runTransitionTx(
  db: Db,
  args: {
    orderId: number
    fromStateId: number | null
    toStateId: number
    stateLabel: string
    stateColor: string
    note: string | null
    isIncident: boolean
    isClientVisible: boolean
    notifyClient: boolean
    actorId: number
  },
): number {
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO state_events
           (order_id, from_state_id, to_state_id, state_label_snapshot, state_color_snapshot,
            note, is_incident, is_client_visible, notify_client, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        args.orderId,
        args.fromStateId,
        args.toStateId,
        args.stateLabel,
        args.stateColor,
        args.note,
        args.isIncident ? 1 : 0,
        args.isClientVisible ? 1 : 0,
        args.notifyClient ? 1 : 0,
        args.actorId,
      )

    const terminal = db
      .prepare<[number], { is_terminal: number }>('SELECT is_terminal FROM repair_states WHERE id = ?')
      .get(args.toStateId)?.is_terminal

    db.prepare(
      `UPDATE repair_orders
       SET state_id = ?,
           state_changed_at = datetime('now'),
           status = CASE WHEN ? = 1 THEN 'delivered' ELSE status END,
           delivered_at = CASE WHEN ? = 1 THEN datetime('now') ELSE delivered_at END,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(args.toStateId, terminal ?? 0, terminal ?? 0, args.orderId)

    return Number(info.lastInsertRowid)
  })
  return tx()
}

export function updateOrder(
  db: Db,
  orderId: number,
  patch: {
    mechanicId?: number | null
    clientNote?: string | null
    mileage?: number | null
    status?: 'open' | 'cancelled'
  },
): RepairOrderRow {
  const order = db
    .prepare<[number], RepairOrderRow>('SELECT * FROM repair_orders WHERE id = ?')
    .get(orderId)
  if (!order) throw notFound('Reparacion no encontrada')

  if (patch.mechanicId) assertStaff(db, patch.mechanicId)

  const sets: string[] = []
  const values: (string | number | null)[] = []
  if (patch.mechanicId !== undefined) {
    sets.push('mechanic_id = ?')
    values.push(patch.mechanicId)
  }
  if (patch.clientNote !== undefined) {
    sets.push('client_note = ?')
    values.push(patch.clientNote)
  }
  if (patch.mileage !== undefined) {
    sets.push('mileage = ?')
    values.push(patch.mileage)
  }
  if (patch.status !== undefined) {
    if (patch.status === 'cancelled' && order.status === 'delivered') {
      throw conflict('No se puede cancelar una reparacion ya entregada')
    }
    sets.push('status = ?')
    values.push(patch.status)
  }
  if (sets.length) {
    values.push(orderId)
    db.prepare(
      `UPDATE repair_orders SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    ).run(...values)
    // Reasignar o cancelar cambia lo que ve el resto del taller.
    emitToStaff({ type: 'order.updated', orderId })
    emitToStaff({ type: 'order.list' })
  }
  return db.prepare<[number], RepairOrderRow>('SELECT * FROM repair_orders WHERE id = ?').get(orderId)!
}

/* ------------------------------------------------------------------ *
 * Items y totales
 * ------------------------------------------------------------------ */

export function addItem(
  db: Db,
  orderId: number,
  input: { kind: OrderItemRow['kind']; description: string; qty: number; unitPriceCents: number },
): OrderItemRow {
  const order = db
    .prepare<[number], RepairOrderRow>('SELECT * FROM repair_orders WHERE id = ?')
    .get(orderId)
  if (!order) throw notFound('Reparacion no encontrada')
  if (order.status !== 'open') throw conflict('La reparacion ya no esta abierta')
  if (!input.description.trim()) throw badRequest('La descripcion es obligatoria')
  if (input.qty <= 0) throw badRequest('La cantidad debe ser mayor que cero')

  const info = db
    .prepare(
      `INSERT INTO order_items (order_id, kind, description, qty, unit_price_cents)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(orderId, input.kind, input.description.trim(), input.qty, Math.max(0, Math.round(input.unitPriceCents)))

  recalcTotals(db, orderId)
  emitToStaff({ type: 'order.updated', orderId })
  return db.prepare<[number], OrderItemRow>('SELECT * FROM order_items WHERE id = ?').get(
    Number(info.lastInsertRowid),
  )!
}

export function updateItem(
  db: Db,
  itemId: number,
  patch: Partial<{ description: string; qty: number; unitPriceCents: number; status: OrderItemRow['status'] }>,
): OrderItemRow {
  const item = db
    .prepare<[number], OrderItemRow>('SELECT * FROM order_items WHERE id = ?')
    .get(itemId)
  if (!item) throw notFound('Item no encontrado')

  const sets: string[] = []
  const values: (string | number)[] = []
  if (patch.description !== undefined) {
    sets.push('description = ?')
    values.push(patch.description.trim())
  }
  if (patch.qty !== undefined) {
    sets.push('qty = ?')
    values.push(patch.qty)
  }
  if (patch.unitPriceCents !== undefined) {
    sets.push('unit_price_cents = ?')
    values.push(Math.max(0, Math.round(patch.unitPriceCents)))
  }
  if (patch.status !== undefined) {
    sets.push('status = ?')
    values.push(patch.status)
  }
  if (sets.length) {
    values.push(itemId)
    db.prepare(`UPDATE order_items SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }
  recalcTotals(db, item.order_id)
  emitToStaff({ type: 'order.updated', orderId: item.order_id })
  return db.prepare<[number], OrderItemRow>('SELECT * FROM order_items WHERE id = ?').get(itemId)!
}

export function removeItem(db: Db, itemId: number): void {
  const item = db
    .prepare<[number], OrderItemRow>('SELECT * FROM order_items WHERE id = ?')
    .get(itemId)
  if (!item) throw notFound('Item no encontrado')
  db.prepare('DELETE FROM order_items WHERE id = ?').run(itemId)
  recalcTotals(db, item.order_id)
  emitToStaff({ type: 'order.updated', orderId: item.order_id })
}

/** Los items cancelados no suman; el descuento viene de=redemptions aplicados. */
export function recalcTotals(db: Db, orderId: number): RepairOrderRow {
  const row = db
    .prepare<[number], { subtotal: number }>(
      `SELECT COALESCE(SUM(qty * unit_price_cents), 0) AS subtotal
       FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
    )
    .get(orderId)!

  const subtotal = Math.round(row.subtotal)
  const discount =
    db
      .prepare<[number], { total: number }>(
        `SELECT COALESCE(SUM(unit_price_cents), 0) AS total
         FROM order_items WHERE order_id = ? AND status != 'cancelled' AND applied_redemption_id IS NOT NULL`,
      )
      .get(orderId)?.total ?? 0

  db.prepare(
    `UPDATE repair_orders
     SET subtotal_cents = ?, discount_cents = ?, total_cents = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(subtotal, discount, Math.max(0, subtotal - discount), orderId)

  db.prepare(
    `UPDATE invoices SET total_cents = ? WHERE order_id = ? AND status != 'void'`,
  ).run(Math.max(0, subtotal - discount), orderId)

  return db.prepare<[number], RepairOrderRow>('SELECT * FROM repair_orders WHERE id = ?').get(orderId)!
}

/* ------------------------------------------------------------------ *
 * Facturacion
 * ------------------------------------------------------------------ */

export function issueInvoice(
  db: Db,
  orderId: number,
  opts: { paymentMethod?: string; markPaid?: boolean } = {},
): { id: number; number: string; total_cents: number; status: string } {
  const order = recalcTotals(db, orderId)
  if (!order) throw notFound('Reparacion no encontrada')
  if (order.status !== 'delivered') throw conflict('Solo se factura una reparacion entregada')

  const existing = db
    .prepare<[number], { id: number; number: string; total_cents: number; status: string }>(
      'SELECT id, number, total_cents, status FROM invoices WHERE order_id = ?',
    )
    .get(orderId)
  if (existing) {
    if (opts.markPaid && existing.status === 'issued') {
      db.prepare("UPDATE invoices SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(
        existing.id,
      )
    }
    return { ...existing, status: opts.markPaid ? 'paid' : existing.status }
  }

  const number = nextInvoiceNumber(db)
  const status = opts.markPaid ? 'paid' : 'issued'

  const info = db
    .prepare(
      `INSERT INTO invoices (order_id, number, status, payment_method, paid_at, total_cents, currency)
       VALUES (?, ?, ?, ?, CASE WHEN ? = 'paid' THEN datetime('now') END, ?, ?)`,
    )
    .run(orderId, number, status, opts.paymentMethod ?? null, status, order.total_cents, order.currency)

  notifyUser(db, order.client_id, {
    title: 'Factura disponible',
    body: `Factura ${number} por $${(order.total_cents / 100).toFixed(2)}`,
    kind: 'billing',
    orderId,
  }).catch(() => undefined)

  // notifyUser ya avisa al cliente; al taller le llega por la misma via.
  return { id: Number(info.lastInsertRowid), number, total_cents: order.total_cents, status }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function assertStaff(db: Db, userId: number): void {
  const user = db
    .prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?')
    .get(userId)
  if (!user) throw notFound('Usuario no encontrado')
  if (user.role !== 'mechanic' && user.role !== 'admin') throw forbidden('El usuario no es parte del personal')
}
