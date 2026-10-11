/**
 * Limitador de peticiones, independiente del runtime.
 *
 * En local (Node) y en tests se usa un `Map` en memoria: el proceso es unico y
 * dura toda la sesion. En Workers se inyecta el `RateLimiter` de
 * `worker/rate-limit-do.ts`, que es el unico que mantiene memoria entre
 * peticiones.
 *
 * El dominio nunca sabe en que runtime corre, igual que con el bus de eventos.
 */

export interface RateResult {
  ok: boolean
  retryAfterMs: number
}

export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<RateResult>
  reset(key: string): Promise<void>
}

class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>()

  async hit(key: string, limit: number, windowMs: number): Promise<RateResult> {
    const now = Date.now()
    const current = this.buckets.get(key)
    const bucket = !current || now >= current.resetAt ? { count: 0, resetAt: now + windowMs } : current

    bucket.count += 1
    this.buckets.set(key, bucket)

    if (bucket.count <= limit) return { ok: true, retryAfterMs: 0 }
    return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) }
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key)
  }

  /** Solo para tests: deja el estado como estaba. */
  clear(): void {
    this.buckets.clear()
  }
}

let remote: RateLimiter | null = null
const local = new MemoryRateLimiter()

/** El arranque del Worker inyecta aqui su Durable Object. */
export function setLimiter(next: RateLimiter | null): void {
  remote = next
}

export function limiter(): RateLimiter {
  return remote ?? local
}

/** Solo para tests. */
export function resetLimiterForTest(): void {
  local.clear()
}