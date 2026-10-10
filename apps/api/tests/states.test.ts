import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db/connection.js'
import { applyTransition, createOrder, getOrderDetail } from '../src/modules/repairs/service.js'
import { listStates, resolveState } from '../src/modules/repairs/states.js'
import { CLIENT, MECHANIC, freshDb, seedUsers, seedVehicle } from './helpers.js'

describe('motor de estados', () => {
  let db: Db
  let vehicleId: number

  beforeEach(async () => {
    db = await freshDb()
    await seedUsers(db)
    vehicleId = await seedVehicle(db)
  })

  it('crea automaticamente un estado escrito por el mecanico', async () => {
    const state = await resolveState(db, 'Esperando repuesto del proveedor')

    expect(state.key).toBe('esperando-repuesto-del-proveedor')
    expect(state.is_custom).toBe(1)
    expect(state.is_suggested).toBe(0)
    expect(state.label).toBe('Esperando repuesto del proveedor')
  })

  it('reutiliza el estado si ya existe, ignorando acentos y mayusculas', async () => {
    const a = await resolveState(db, 'En reparación')
    const b = await resolveState(db, 'en reparacion')

    expect(b.id).toBe(a.id)
  })

  it('no duplica estados cuando el taller repite el mismo texto', async () => {
    const before = (await listStates(db)).length
    await resolveState(db, 'Prueba de sonido')
    await resolveState(db, 'prueba de sonido')
    await resolveState(db, '  Prueba   de  sonido ')

    expect((await listStates(db)).length).toBe(before + 1)
  })

  it('inicia la orden en estado Recibido, visible para el cliente', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    const detail = await getOrderDetail(db, orderId, { staffView: true })

    expect(detail.order.state_label).toBe('Recibido')
    expect(detail.order.status).toBe('open')
    expect(detail.events[0]?.is_client_visible).toBe(1)
  })

  it('guarda el estado escrito aunque no existiera, con su evento', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })

    const result = await applyTransition(db, {
      orderId,
      toStateLabel: 'Desmontando tren delantero',
      actorId: MECHANIC.id,
      note: 'Se去掉 mas tarde',
      notifyClient: true,
    })

    expect(result.state.label).toBe('Desmontando tren delantero')
    expect(result.delivered).toBe(false)

    const detail = await getOrderDetail(db, orderId, { staffView: true })
    const last = detail.events.at(-1)
    expect(last?.state_label_snapshot).toBe('Desmontando tren delantero')
    expect(last?.note).toBe('Se去掉 mas tarde')
    expect(last?.notify_client).toBe(1)
  })

  it('oculta al cliente los eventos marcados como internos', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await applyTransition(db, {
      orderId,
      toStateLabel: 'En reparación',
      actorId: MECHANIC.id,
      note: 'Se necesita rectificar',
      isClientVisible: false,
    })

    const staffView = await getOrderDetail(db, orderId, { staffView: true })
    const clientView = await getOrderDetail(db, orderId, { staffView: false })

    expect(staffView.events.length).toBe(2)
    expect(clientView.events.length).toBe(1)
    expect(clientView.events[0]?.state_label_snapshot).toBe('Recibido')
  })

  it('marca el estado como contratiempo cuando el taller lo indica', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await applyTransition(db, {
      orderId,
      toStateLabel: 'Esperando repuesto',
      actorId: MECHANIC.id,
      isIncident: true,
      notifyClient: true,
    })

    const state = (await listStates(db)).find((s) => s.label === 'Esperando repuesto')
    expect(state?.is_incident).toBe(1)
  })

  it('cierra la orden y otorga puntos al entrar en un estado de entrega', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await applyTransition(db, { orderId, toStateLabel: 'En reparación', actorId: MECHANIC.id })

    const result = await applyTransition(db, {
      orderId,
      toStateLabel: 'Entregado',
      actorId: MECHANIC.id,
      notifyClient: true,
    })

    expect(result.delivered).toBe(true)
    expect(result.pointsAwarded).toBe(5)

    const account = (await db
      .prepare<[number], { points_balance: number }>(
        'SELECT points_balance FROM loyalty_accounts WHERE client_id = ?',
      )
      .get(CLIENT.id))!
    expect(account.points_balance).toBe(5)

    const detail = await getOrderDetail(db, orderId, { staffView: true })
    expect(detail.order.status).toBe('delivered')
    expect(detail.order.delivered_at).not.toBeNull()
  })

  it('permite escribir Entregado aunque no sea el estado terminal sugerido', async () => {
    // El taller decide el flujo: cualquier estado puede marcarse como entrega.
    await resolveState(db, 'Listo y entregado', {})
    await db
      .prepare("UPDATE repair_states SET is_terminal = 1 WHERE label = 'Listo y entregado'")
      .run()

    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    const result = await applyTransition(db, {
      orderId,
      toStateLabel: 'Listo y entregado',
      actorId: MECHANIC.id,
    })

    expect(result.delivered).toBe(true)
  })

  it('rechaza transiciones sobre una orden cancelada', async () => {
    const orderId = await createOrder(db, {
      clientId: CLIENT.id,
      vehicleId,
      mechanicId: MECHANIC.id,
    })
    await db.prepare("UPDATE repair_orders SET status = 'cancelled' WHERE id = ?").run(orderId)

    await expect(
      applyTransition(db, { orderId, toStateLabel: 'En reparación', actorId: MECHANIC.id }),
    ).rejects.toThrow(/cancelada/i)
  })
})
