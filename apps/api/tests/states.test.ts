import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db/connection.js'
import { applyTransition, createOrder, getOrderDetail } from '../src/modules/repairs/service.js'
import { listStates, resolveState } from '../src/modules/repairs/states.js'
import { CLIENT, MECHANIC, freshDb, seedUsers, seedVehicle } from './helpers.js'

describe('motor de estados', () => {
  let db: Db
  let vehicleId: number

  beforeEach(async () => {
    db = freshDb()
    await seedUsers(db)
    vehicleId = seedVehicle(db)
  })

  it('crea automaticamente un estado escrito por el mecanico', () => {
    const state = resolveState(db, 'Esperando repuesto del proveedor')

    expect(state.key).toBe('esperando-repuesto-del-proveedor')
    expect(state.is_custom).toBe(1)
    expect(state.is_suggested).toBe(0)
    expect(state.label).toBe('Esperando repuesto del proveedor')
  })

  it('reutiliza el estado si ya existe, ignorando acentos y mayusculas', () => {
    const a = resolveState(db, 'En reparación')
    const b = resolveState(db, 'en reparacion')

    expect(b.id).toBe(a.id)
  })

  it('no duplica estados cuando el taller repite el mismo texto', () => {
    const before = listStates(db).length
    resolveState(db, 'Prueba de sonido')
    resolveState(db, 'prueba de sonido')
    resolveState(db, '  Prueba   de  sonido ')

    expect(listStates(db).length).toBe(before + 1)
  })

  it('inicia la orden en estado Recibido, visible para el cliente', () => {
    const orderId = createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })
    const detail = getOrderDetail(db, orderId, { staffView: true })

    expect(detail.order.state_label).toBe('Recibido')
    expect(detail.order.status).toBe('open')
    expect(detail.events[0]?.is_client_visible).toBe(1)
  })

  it('guarda el estado escrito aunque no existiera, con su evento', () => {
    const orderId = createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })

    const result = applyTransition(db, {
      orderId,
      toStateLabel: 'Desmontando tren delantero',
      actorId: MECHANIC.id,
      note: 'Se去掉 mas tarde',
      notifyClient: true,
    })

    expect(result.state.label).toBe('Desmontando tren delantero')
    expect(result.delivered).toBe(false)

    const detail = getOrderDetail(db, orderId, { staffView: true })
    const last = detail.events.at(-1)
    expect(last?.state_label_snapshot).toBe('Desmontando tren delantero')
    expect(last?.note).toBe('Se去掉 mas tarde')
    expect(last?.notify_client).toBe(1)
  })

  it('oculta al cliente los eventos marcados como internos', () => {
    const orderId = createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })
    applyTransition(db, {
      orderId,
      toStateLabel: 'En reparación',
      actorId: MECHANIC.id,
      note: 'Se necesita rectificar',
      isClientVisible: false,
    })

    const staffView = getOrderDetail(db, orderId, { staffView: true })
    const clientView = getOrderDetail(db, orderId, { staffView: false })

    expect(staffView.events.length).toBe(2)
    expect(clientView.events.length).toBe(1)
    expect(clientView.events[0]?.state_label_snapshot).toBe('Recibido')  })

  it('marca el estado como contratiempo cuando el taller lo indica', () => {
    const orderId = createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })
    applyTransition(db, {
      orderId,
      toStateLabel: 'Esperando repuesto',
      actorId: MECHANIC.id,
      isIncident: true,
      notifyClient: true,
    })

    const state = listStates(db).find((s) => s.label === 'Esperando repuesto')
    expect(state?.is_incident).toBe(1)
  })

  it('cierra la orden y otorga puntos al entrar en un estado de entrega', () => {
    const orderId = createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })
    applyTransition(db, { orderId, toStateLabel: 'En reparación', actorId: MECHANIC.id })

    const result = applyTransition(db, {
      orderId,
      toStateLabel: 'Entregado',
      actorId: MECHANIC.id,
      notifyClient: true,
    })

    expect(result.delivered).toBe(true)
    expect(result.pointsAwarded).toBe(5)

    const account = db
      .prepare<[], { points_balance: number }>(
        'SELECT points_balance FROM loyalty_accounts WHERE client_id = ?',
      )
      .get(CLIENT.id)!
    expect(account.points_balance).toBe(5)

    const detail = getOrderDetail(db, orderId, { staffView: true })
    expect(detail.order.status).toBe('delivered')
    expect(detail.order.delivered_at).not.toBeNull()
  })

  it('permite escribir Entregado aunque no sea el estado terminal sugerido', () => {
    // El taller decide el flujo: cualquier estado puede marcarse como entrega.
    resolveState(db, 'Listo y entregado', {})
    db.prepare("UPDATE repair_states SET is_terminal = 1 WHERE label = 'Listo y entregado'").run()

    const orderId = createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })
    const result = applyTransition(db, {
      orderId,
      toStateLabel: 'Listo y entregado',
      actorId: MECHANIC.id,
    })

    expect(result.delivered).toBe(true)
  })

  it('rechaza transiciones sobre una orden cancelada', () => {
    const orderId = createOrder(db, { clientId: CLIENT.id, vehicleId, mechanicId: MECHANIC.id })
    db.prepare("UPDATE repair_orders SET status = 'cancelled' WHERE id = ?").run(orderId)

    expect(() =>
      applyTransition(db, { orderId, toStateLabel: 'En reparación', actorId: MECHANIC.id }),
    ).toThrow(/cancelada/i)
  })
})
