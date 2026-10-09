import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  connectionCount,
  emitOrderChange,
  emitToStaff,
  emitToUser,
  resetBus,
  subscribe,
  subscribeStaff,
  type PitsEvent,
} from '../src/shared/events.js'

/** El payload es `event: <tipo>\ndata: <json>\n\n`. Los heartbeats son comentarios. */
function collector(into: PitsEvent[]) {
  return (payload: string) => {
    if (!payload.startsWith('event:')) return // comentario de heartbeat
    const dataLine = payload.split('\n').find((l) => l.startsWith('data: '))
    if (!dataLine) return
    into.push(JSON.parse(dataLine.slice('data: '.length)) as PitsEvent)
  }
}

describe('bus de eventos', () => {
  let received: PitsEvent[]
  let send: (payload: string) => void

  beforeEach(() => {
    resetBus()
    received = []
    send = collector(received)
  })

  afterEach(() => {
    resetBus()
  })

  it('entrega los eventos al suscriptor de ese usuario', () => {
    const off = subscribe(7, send)

    emitToUser(7, { type: 'order.updated', orderId: 42 })

    expect(received).toEqual([{ type: 'order.updated', orderId: 42 }])
    off()
  })

  it('no entrega eventos a otro usuario', () => {
    const off = subscribe(7, send)

    emitToUser(8, { type: 'order.updated', orderId: 42 })

    expect(received).toEqual([])
    off()
  })

  it('soporta varias pestanas del mismo usuario', () => {
    const second: PitsEvent[] = []
    const off1 = subscribe(7, send)
    const off2 = subscribe(7, collector(second))

    emitToUser(7, { type: 'loyalty.updated' })

    expect(received).toHaveLength(1)
    expect(second).toHaveLength(1)
    off1()
    off2()
  })

  it('deja de entregar tras desuscribirse', () => {
    const off = subscribe(7, send)
    off()

    emitToUser(7, { type: 'order.updated', orderId: 1 })

    expect(received).toEqual([])
  })

  it('el suscriptor de personal recibe cambios de cualquier orden', () => {
    const off = subscribeStaff(7, send)

    emitToStaff({ type: 'order.updated', orderId: 99 })

    expect(received).toEqual([{ type: 'order.updated', orderId: 99 }])
    off()
  })

  it('emitOrderChange avisa al cliente y al taller', () => {
    const staff: PitsEvent[] = []
    const offClient = subscribe(3, send)
    const offStaff = subscribeStaff(7, collector(staff))

    emitOrderChange(3, 55)

    expect(received).toEqual([{ type: 'order.updated', orderId: 55 }])
    expect(staff).toEqual([{ type: 'order.updated', orderId: 55 }])
    offClient()
    offStaff()
  })

  it('un suscriptor que lanza no arrastra a los demas', () => {
    const ok: PitsEvent[] = []
    const offBad = subscribe(7, () => {
      throw new Error('socket muerto')
    })
    const offGood = subscribe(7, collector(ok))

    expect(() => emitToUser(7, { type: 'order.updated', orderId: 1 })).not.toThrow()
    expect(ok).toHaveLength(1)
    offBad()
    offGood()
  })

  it('el formato es el que espera EventSource', () => {
    const raw: string[] = []
    const off = subscribe(7, (p) => raw.push(p))

    emitToUser(7, { type: 'order.updated', orderId: 42 })

    expect(raw[0]).toBe('event: order.updated\ndata: {"type":"order.updated","orderId":42}\n\n')
    off()
  })

  it('cuenta las conexiones abiertas', () => {
    expect(connectionCount()).toBe(0)
    const a = subscribe(1, send)
    const b = subscribe(2, send)
    expect(connectionCount()).toBe(2)
    a()
    expect(connectionCount()).toBe(1)
    b()
    expect(connectionCount()).toBe(0)
  })
})
