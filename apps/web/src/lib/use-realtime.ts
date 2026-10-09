import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { tokenStore } from '@/lib/api'
import { invalidateOrder, keys } from '@/lib/query-keys'

/** Mismo contrato que el bus del API (apps/api/src/shared/events.ts). */
export type PitsEvent =
  | { type: 'order.updated'; orderId: number }
  | { type: 'order.list' }
  | { type: 'loyalty.updated' }
  | { type: 'notification.new' }

const CHANNEL = 'pits'
const EVENT_TYPES: PitsEvent['type'][] = [
  'order.updated',
  'order.list',
  'loyalty.updated',
  'notification.new',
]

async function apply(client: QueryClient, event: PitsEvent): Promise<void> {
  switch (event.type) {
    case 'order.updated':
      // Detalle, listado del taller y vistas del cliente, de una sola vez.
      await invalidateOrder(client, event.orderId)
      break
    case 'order.list':
      await client.invalidateQueries({ queryKey: keys.staffRepairs() })
      break
    case 'loyalty.updated':
      await client.invalidateQueries({ queryKey: keys.loyalty() })
      await client.invalidateQueries({ queryKey: keys.dashboard() })
      await client.invalidateQueries({ queryKey: keys.redemptions() })
      break
    case 'notification.new':
      await client.invalidateQueries({ queryKey: keys.notifications() })
      break
  }
}

/**
 * Canal en vivo del portal.
 *
 * Resuelve el caso real: el cliente tiene la app abierta en su telefono y el
 * taller mueve el estado. Sin esto la pantalla del cliente se quedaba
 * congelada hasta que recargara.
 *
 * Una unica conexion SSE por pestana. Cada evento que llega del servidor se
 * reemite por BroadcastChannel, de modo que las demas pestanas del mismo
 * navegador se actualizan al instante sin abrir su propio stream: util para
 * probar mecanico y cliente en una sola maquina.
 */
export function useRealtime(enabled: boolean): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const client = queryClient
    let source: EventSource | null = null
    let channel: BroadcastChannel | null = null
    let retry = 0
    let retryTimer: number | undefined
    let closed = false

    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL)
      // Evento recibido de otra pestana: solo refrescar, no reemitir.
      channel.onmessage = (e) => {
        void handle(String(e.data))
      }
    }

    function handle(raw: string): void {
      let event: PitsEvent
      try {
        event = JSON.parse(raw) as PitsEvent
      } catch {
        return
      }
      void apply(client, event)
    }

    /** Evento del servidor: refrescar aqui y reemitir a las otras pestanas. */
    function handleFromServer(raw: string): void {
      let event: PitsEvent
      try {
        event = JSON.parse(raw) as PitsEvent
      } catch {
        return
      }
      void apply(client, event)
      channel?.postMessage(JSON.stringify(event))
    }

    const connect = () => {
      if (closed) return
      const token = tokenStore.access()
      if (!token) return

      source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`)

      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (e) => handleFromServer((e as MessageEvent<string>).data))
      }

      source.onopen = () => {
        retry = 0
      }

      source.onerror = () => {
        source?.close()
        source = null
        if (closed) return
        // Backoff suave: 2s, 4s, 8s... hasta 30s.
        retryTimer = window.setTimeout(connect, Math.min(30_000, 2000 * 2 ** retry++))
      }
    }

    connect()

    return () => {
      closed = true
      window.clearTimeout(retryTimer)
      source?.close()
      channel?.close()
    }
  }, [enabled, queryClient])
}
