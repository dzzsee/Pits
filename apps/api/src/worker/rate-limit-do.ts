/**
 * Limitador de peticiones con memoria estable.
 *
 * Un isolate de Worker es efimero y hay muchos en paralelo, asi que un `Map`
 * en memoria no frenaria nada en produccion: cada isolate contaria por su
 * cuenta. Este Durable Object mantiene los contadores, que es lo que hace que
 * el limite signifique algo.
 *
 * Una sola instancia para todo el taller (`idFromName('pits')`), igual que el
 * hub de realtime: el sistema es pequeño y un unico contador evita tener que
 * repartir claves entre objetos.
 *
 * La clase extiende `DurableObject` de `cloudflare:workers`: es lo que
 * habilita el acceso por RPC desde el Worker.
 */
import { DurableObject } from 'cloudflare:workers'

interface Bucket {
  /** Veces que se ha pedido dentro de la ventana. */
  count: number
  /** Instante en que se vacio la ventana (epoch ms). */
  resetAt: number
}

/** Barrido de entradas caducadas: no dejar que el almacenamiento crezca sin fin. */
const SWEEP_MS = 5 * 60 * 1000

export class RateLimiter extends DurableObject {
  private buckets = new Map<string, Bucket>()

  /**
   * @param limit  Peticiones permitidas por ventana.
   * @param windowMs  Longitud de la ventana.
   * @returns Si la peticion se admite, y cuanto queda de ventana para reintentar.
   */
  async hit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterMs: number }> {
    const now = Date.now()
    const current = this.buckets.get(key)

    // Ventana fija: si la actual ya vencio, empieza otra.
    const bucket = !current || now >= current.resetAt ? { count: 0, resetAt: now + windowMs } : current

    bucket.count += 1
    this.buckets.set(key, bucket)

    if (bucket.count <= limit) {
      void this.scheduleSweep()
      return { ok: true, retryAfterMs: 0 }
    }

    return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) }
  }

  /** Limpia el contador de una clave (se usa tras un login correcto). */
  async reset(key: string): Promise<void> {
    this.buckets.delete(key)
  }

  private async scheduleSweep(): Promise<void> {
    if (this.sweeping) return
    this.sweeping = true
    try {
      void this.ctx.storage.setAlarm(Date.now() + SWEEP_MS)
    } finally {
      this.sweeping = false
    }
  }

  private sweeping = false

  override async alarm(): Promise<void> {
    const now = Date.now()
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key)
    }
    // Solo se sigue despertando el objeto mientras quede algo que limpiar.
    if (this.buckets.size > 0) {
      void this.ctx.storage.setAlarm(now + SWEEP_MS)
    }
  }
}