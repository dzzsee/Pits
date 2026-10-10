import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db/connection.js'
import {
  addItem,
  createOrder,
  getOrderDetail,
  issueInvoice,
  listOrders,
  recalcTotals,
  updateItem,
} from '../src/modules/repairs/service.js'
import { reportsCsv, reportsSummary } from '../src/modules/reports/service.js'
import { CLIENT, MECHANIC, freshDb, seedOtherClient, seedUsers, seedVehicle } from './helpers.js'

describe('ordenes y facturacion', () => {
  let db: Db
  let vehicleId: number

  beforeEach(async () => {
    db = await freshDb()
    await seedUsers(db)
    vehicleId = await seedVehicle(db)
  })

  it('no deja abrir una orden con un vehiculo ajeno', async () => {
    const otro = await seedVehicle(db, await seedOtherClient(db))
    await expect(
      createOrder(db, { clientId: CLIENT.id, vehicleId: otro, mechanicId: MECHANIC.id }),
    ).rejects.toThrow(/no pertenece/i)
  })

  it('suma los items y calcula el total', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })

    await addItem(db, orderId, {
      kind: 'part',
      description: 'Pastillas',
      qty: 1,
      unitPriceCents: 8500,
    })
    await addItem(db, orderId, {
      kind: 'labor',
      description: 'Mano de obra',
      qty: 2,
      unitPriceCents: 3000,
    })

    const order = (await db
      .prepare<[number], { subtotal_cents: number; total_cents: number }>(
        'SELECT subtotal_cents, total_cents FROM repair_orders WHERE id = ?',
      )
      .get(orderId))!

    expect(order.subtotal_cents).toBe(14500)
    expect(order.total_cents).toBe(14500)
  })

  it('excluye del total los items cancelados', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    const item = await addItem(db, orderId, {
      kind: 'part',
      description: 'Filtro',
      qty: 1,
      unitPriceCents: 2000,
    })

    await updateItem(db, item.id, { status: 'cancelled' })

    const order = (await db
      .prepare<[number], { total_cents: number }>(
        'SELECT total_cents FROM repair_orders WHERE id = ?',
      )
      .get(orderId))!
    expect(order.total_cents).toBe(0)
  })

  it('aplica el descuento de un item canjeado con puntos', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await addItem(db, orderId, {
      kind: 'labor',
      description: 'Cambio de aceite',
      qty: 1,
      unitPriceCents: 4000,
    })

    const info = await db
      .prepare(
        `INSERT INTO redemptions (client_id, label, code, status) VALUES (?, 'Lavado gratis', 'PITS-TEST-CODE', 'used')`,
      )
      .run(CLIENT.id)

    await db
      .prepare(
        `INSERT INTO order_items (order_id, kind, description, qty, unit_price_cents, applied_redemption_id)
         VALUES (?, 'service', 'Lavado', 1, 1500, ?)`,
      )
      .run(orderId, Number(info.lastInsertRowid))

    const order = await recalcTotals(db, orderId)

    expect(order.subtotal_cents).toBe(5500)
    expect(order.discount_cents).toBe(1500)
    expect(order.total_cents).toBe(4000)
  })

  it('solo factura ordenes ya entregadas', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await expect(issueInvoice(db, orderId)).rejects.toThrow(/entregada/i)
  })

  it('no deja agregar items a una orden cerrada', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await db.prepare("UPDATE repair_orders SET status = 'delivered' WHERE id = ?").run(orderId)

    await expect(
      addItem(db, orderId, { kind: 'part', description: 'Tarde', qty: 1, unitPriceCents: 100 }),
    ).rejects.toThrow(/abierta/i)
  })

  it('filtra ordenes por estado y busqueda', async () => {
    const a = await createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })
    const b = await createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })
    await db.prepare("UPDATE repair_orders SET status = 'delivered' WHERE id = ?").run(b)

    const open = await listOrders(db, { status: 'open' })
    const delivered = await listOrders(db, { status: 'delivered' })
    const byPlate = await listOrders(db, { q: vehicleId.toString() })

    expect(open.items.map((o) => o.id)).toEqual([a])
    expect(delivered.items.map((o) => o.id)).toEqual([b])
    expect(byPlate.total).toBeGreaterThan(0)
  })

  it('el detalle no expone notas internas al cliente', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await db
      .prepare(
        `INSERT INTO state_events
           (order_id, to_state_id, state_label_snapshot, state_color_snapshot, note, is_client_visible, created_by)
         VALUES (?, (SELECT id FROM repair_states WHERE label = 'En reparación'), 'En reparación', 'amber',
                'Nota interna para el taller', 0, ?)`,
      )
      .run(orderId, MECHANIC.id)

    const staffView = await getOrderDetail(db, orderId, { staffView: true })
    const clientView = await getOrderDetail(db, orderId, { staffView: false })

    expect(staffView.events.some((e) => e.note === 'Nota interna para el taller')).toBe(true)
    expect(clientView.events.some((e) => e.note === 'Nota interna para el taller')).toBe(false)
  })
})

describe('reportes', () => {
  let db: Db

  beforeEach(async () => {
    db = await freshDb()
    await seedUsers(db)
    const vehicleId = await seedVehicle(db)
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await addItem(db, orderId, {
      kind: 'labor',
      description: 'Revision',
      qty: 1,
      unitPriceCents: 12000,
    })
    await db
      .prepare(
        "UPDATE repair_orders SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?",
      )
      .run(orderId)
  })

  it('resume ordenes e ingresos', async () => {
    const summary = await reportsSummary(db)

    expect(summary.orders.delivered).toBe(1)
    expect(summary.revenue.totalCents).toBe(12000)
    expect(summary.mechanics[0]?.orders).toBe(1)
    expect(summary.loyalty.clients).toBe(1)
  })

  it('exporta CSV con una fila por orden', async () => {
    const csv = await reportsCsv(db)
    const lines = csv.split('\n')

    expect(lines[0]).toContain('Codigo')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('120.00')
  })

  it('filtra por rango de fechas', async () => {
    const summary = await reportsSummary(db, { from: '2000-01-01', to: '2000-01-02' })
    expect(summary.orders.delivered).toBe(0)
    expect(summary.revenue.totalCents).toBe(0)
  })
})
