/**
 * Bus de eventos para Server-Sent Events.
 *
 * En local el bus es un `Map` en memoria: el proceso es unico y dura toda la
 * sesion de desarrollo. En Workers el isolate es efimero, asi que el mismo
 * contrato se apoya en un Durable Object (`RealtimeHub`) que mantiene las
 * conexiones abiertas y reparte los eventos.
 *
 * El dominio siempre llama a `emitToUser` / `emitToStaff`. Si hay un hub
 * remoto configurado, el evento se delega en el; si no, va al mapa local. Por
 * eso el codigo de dominio no sabe en que runtime corre.
 */

export type PitsEvent =
  | { type: 'order.updated'; orderId: number }
  | { type: 'order.list' }
  | { type: 'loyalty.updated' }
  | { type: 'notification.new' }

/** Suscriptor: escribe el evento ya serializado en el stream. */
type Subscriber = (payload: string) => void

export function encode(event: PitsEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

/* ---------------------------- Hub remoto (Workers) ----------------------- */

export interface RemoteConnection {
  stream: ReadableStream<Uint8Array>
}

export interface RealtimeHub {
  open(userId: number, role: string): Promise<RemoteConnection>
  publish(userId: number, event: PitsEvent): Promise<void>
  publishStaff(event: PitsEvent): Promise<void>
}

let hub: RealtimeHub | null = null

/** El arranque del Worker inyecta el Durable Object aqui. */
export function setHub(next: RealtimeHub | null): void {
  hub = next
}

/**
 * Lo que el Worker le pide al Durable Object al abrir `/api/stream`.
 * Lanza si no hay hub configurado, que solo pasaria en un binding ausente.
 */
async function openRemoteStream(userId: number, role: string): Promise<RemoteConnection> {
  if (!hub) throw new Error('No hay hub de realtime configurado')
  return hub.open(userId, role)
}

/**
 * Stream SSE en local: cada conexion tiene su propio `TransformStream` y se
 * suscribe al bus en memoria. Es el equivalente en Node del Durable Object.
 */
function openLocalStream(userId: number, role: string): RemoteConnection {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const unsubscribe = role === 'client' ? subscribe(userId, send) : subscribeStaff(userId, send)

  function send(payload: string): void {
    // Escritura sin esperar: el bus es sincrono y no debe bloquear al emisor.
    // Cuando el navegador cierra la conexion, `readable` se cancela y la
    // escritura falla: ese es el momento de darse de baja.
    void writer.write(encoder.encode(payload)).catch(() => unsubscribe())
  }

  // Primeros bytes: confirman al cliente que la conexion esta viva y fijan el
  // intervalo de reconexion.
  send('retry: 3000\n\n')

  return { stream: readable }
}

export function openStream(userId: number, role: string): Promise<RemoteConnection> {
  return hub ? openRemoteStream(userId, role) : Promise.resolve(openLocalStream(userId, role))
}

/* --------------------------- Hub en memoria (local) ---------------------- */

const subscribers = new Map<number, Set<Subscriber>>()
const staffSubscribers = new Set<Subscriber>()

/** Comment Keep-Alive: sin trafico, proxies y navegadores cierran la conexion. */
const HEARTBEAT_MS = 25_000
let heartbeat: ReturnType<typeof setInterval> | null = null

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
  // Sin await a proposito: la API es sincrona para el dominio. El Worker
  // entrega la peticion con `waitUntil`, asi que la escritura no se pierde al
  // cerrar la respuesta.
  if (hub) {
    void hub.publish(userId, event)
    return
  }

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
  if (hub) {
    void hub.publishStaff(event)
    return
  }

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

function allSubscribers(): Subscriber[] {
  const out: Subscriber[] = []
  for (const set of subscribers.values()) out.push(...set)
  out.push(...staffSubscribers)
  return out
}

function ensureHeartbeat(): void {
  if (heartbeat) return
  heartbeat = setInterval(() => {
    const ping = ': ping\n\n'
    for (const send of allSubscribers()) {
      try {
        send(ping)
      } catch {
        /* idem */
      }
    }
  }, HEARTBEAT_MS)

  // El heartbeat no debe impedir que el proceso termine.
  ;(heartbeat as { unref?: () => void }).unref?.()
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
