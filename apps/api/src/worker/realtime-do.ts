/**
 * Durable Object que sostiene las conexiones SSE.
 *
 * El isolate de un Worker es efimero: guardar los suscriptores en memoria
 * perderia los eventos en cuanto terminara la peticion que abrio el stream. Un
 * Durable Object conserva memoria mientras esta vivo, asi que es el sitio
 * natural para el hub de realtime.
 *
 * Se usa una sola instancia para todo el taller (`idFromName('pits')`): es un
 * sistema pequeno y un unico hub evita tener que repartir eventos entre varios.
 *
 * La clase tiene que extender `DurableObject` de `cloudflare:workers`: es lo que
 * habilita el acceso por RPC desde el Worker. Por eso el metodo de apertura se
 * llama `open` y no `connect`, que choca con un metodo de la clase base.
 */
import { DurableObject } from 'cloudflare:workers'
import { encode, type PitsEvent } from '../shared/events.js'

interface Session {
  userId: number
  staff: boolean
  controller: ReadableStreamDefaultController<Uint8Array>
}

const encoder = new TextEncoder()

/** Comment Keep-Alive: sin trafico, proxies y navegadores cierran la conexion. */
const HEARTBEAT_MS = 25_000

export class RealtimeHub extends DurableObject {
  private sessions = new Set<Session>()

  async open(userId: number, role: string): Promise<{ stream: ReadableStream<Uint8Array> }> {
    const staff = role !== 'client'
    let session: Session | null = null

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        session = { userId, staff, controller }
        this.sessions.add(session)

        // Primeros bytes: confirman que la conexion esta viva y fijan el
        // intervalo de reconexion del EventSource.
        controller.enqueue(encoder.encode('retry: 3000\n\n'))

        // La alarma cumple dos funciones: mantiene el Durable Object vivo
        // mientras hay streaming y hace de heartbeat.
        void this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS)
      },

      // El navegador cerro la conexion. Sin esto el hub acumularia streams
      // muertos y cada envio intentaria escribir sobre uno.
      cancel: () => {
        if (session) this.sessions.delete(session)
        session = null
      },
    })

    return { stream }
  }

  async publish(userId: number, event: PitsEvent): Promise<void> {
    this.broadcast(event, (s) => !s.staff && s.userId === userId)
  }

  async publishStaff(event: PitsEvent): Promise<void> {
    this.broadcast(event, (s) => s.staff)
  }

  /** Latido periodico y, de paso, la razon por la que el objeto sigue vivo. */
  override async alarm(): Promise<void> {
    if (this.sessions.size === 0) return

    const ping = encoder.encode(': ping\n\n')
    for (const session of this.sessions) {
      try {
        session.controller.enqueue(ping)
      } catch {
        this.sessions.delete(session)
      }
    }

    // Si ya no queda nadie, no hay que seguir despertando al objeto.
    if (this.sessions.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS)
    }
  }

  private broadcast(event: PitsEvent, match: (s: Session) => boolean): void {
    const payload = encoder.encode(encode(event))

    for (const session of this.sessions) {
      if (!match(session)) continue
      try {
        session.controller.enqueue(payload)
      } catch {
        // Conexion muerta a mitad de entrega: se descarta y su `cancel` ya no
        // hara falta para limpiar el set.
        this.sessions.delete(session)
      }
    }
  }
}
