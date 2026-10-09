/**
 * Bus de eventos en memoria para Server-Sent Events.
 *
 * Se eligio SSE y no WebSocket porque el flujo es unidireccional: el servidor
 * avisa, el cliente refresca. SSE reconecta solo, atraviesa proxies HTTP
 * corrientes y no necesita libreria.
 *
 * Limitacion conocida: el estado vive en el proceso. Con varias instancias
 * del API cada una solo emite a sus propios clientes. El dia que escale, este
 * archivo se reemplaza por un pub/sub (Redis) sin tocar el resto.
 */

export type PitsEvent =
  | { type: 'order.updated'; orderId: number }
  | { type: 'order.list' }
  | { type: 'loyalty.updated' }
  | { type: 'notification.new' }

/** Suscriptor: escribe el evento ya serializado en el stream. */
type Subscriber = (payload: string) => void

const subscribers = new Map<number, Set<Subscriber>>()
const staffSubscribers = new Set<Subscriber>()

/** Comment Keep-Alive: sin trafico, proxies y navegadores cierran la conexion. */
const HEARTBEAT_MS = 25_000
let heartbeat: NodeJS.Timeout | null = null

function encode(event: PitsEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

export function subscribe(userId: number, send: Subscriber): () => void {
  let set = subscribers.get(userId)
  if (!set) {
    set = new Set()
    subscribers.set(userId, set)
  }
  set.add(send)

  ensureHeartbeat()

  return () => {
    const current = subscribers.get(userId)
    if (!current) return
    current.delete(send)
    if (current.size === 0) subscribers.delete(userId)
    maybeStopHeartbeat()
  }
}

/** Suscripcion para el panel del taller: recibe cambios de cualquier orden. */
export function subscribeStaff(userId: number, send: Subscriber): () => void {
  const off = subscribe(userId, send)
  staffSubscribers.add(send)
  return () => {
    off()
    staffSubscribers.delete(send)
  }
}

export function emitToUser(userId: number, event: PitsEvent): void {
  const payload = encode(event)
  for (const send of subscribers.get(userId) ?? []) {
    try {
      send(payload)
    } catch {
      // Un suscriptor caido no debe arrastrar a los demas.
    }
  }
}

export function emitToStaff(event: PitsEvent): void {
  const payload = encode(event)
  for (const send of staffSubscribers) {
    try {
      send(payload)
    } catch {
      /* ver emitToUser */
    }
  }
}

/** Atajo: el cliente de una orden y el personal que la mira. */
export function emitOrderChange(userId: number | null, orderId: number): void {
  const event: PitsEvent = { type: 'order.updated', orderId }
  if (userId !== null) emitToUser(userId, event)
  emitToStaff(event)
}

function ensureHeartbeat(): void {
  if (heartbeat) return
  heartbeat = setInterval(() => {
    const ping = ': ping\n\n'
    for (const set of subscribers.values()) {
      for (const send of set) {
        try {
          send(ping)
        } catch {
          /* idem */
        }
      }
    }
    for (const send of staffSubscribers) {
      try {
        send(ping)
      } catch {
        /* idem */
      }
    }
  }, HEARTBEAT_MS)

  // El heartbeat no debe impedir que el proceso termine.
  heartbeat.unref?.()
}

function maybeStopHeartbeat(): void {
  if (subscribers.size > 0 || staffSubscribers.size > 0) return
  if (heartbeat) {
    clearInterval(heartbeat)
    heartbeat = null
  }
}

/** Solo para tests: deja el bus como estaba. */
export function resetBus(): void {
  subscribers.clear()
  staffSubscribers.clear()
  maybeStopHeartbeat()
}

export function connectionCount(): number {
  return subscribers.size + staffSubscribers.size
}
