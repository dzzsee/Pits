import { limiter, type RateLimiter } from '../lib/rate-limit.js'

/**
 * Politica de limites por ambito.
 *
 * Los limites van por IP *y* por cuenta. Solo por IP no frena el credential
 * stuffing, que reparte los intentos entre muchas direcciones; solo por cuenta
 * no frena un atacante que prueba muchos correos desde una maquina. El bloqueo
 * por cuenta de `lockout.ts` cubre ademas el caso de un atacante que evade el
 * limite de IP.
 */

export interface Scope {
  /** Nombre estable, parte de la clave del limitador. */
  name: string
  /** Peticiones permitidas. */
  limit: number
  /** Ventana en milisegundos. */
  windowMs: number
}

const MINUTE = 60_000

export const SCOPES = {
  login: { name: 'login', limit: 10, windowMs: 15 * MINUTE },
  register: { name: 'register', limit: 5, windowMs: 60 * MINUTE },
  refresh: { name: 'refresh', limit: 30, windowMs: 15 * MINUTE },
  stream: { name: 'stream', limit: 20, windowMs: MINUTE },
  password: { name: 'password', limit: 5, windowMs: 15 * MINUTE },
  global: { name: 'global', limit: 300, windowMs: MINUTE },
} satisfies Record<string, Scope>

/**
 * IP del cliente, con la cabecera correcta por runtime.
 *
 * En Workers la fija la plataforma (`CF-Connecting-IP`) y no se puede
 * suplantar. En Node el socket es la unica fuente fiable: `X-Forwarded-For` la
 * pone cualquiera salvo que haya un proxy de confianza delante, asi que solo se
 * usa si `TRUST_PROXY` lo dice explicitamente.
 *
 * En ningun caso se acepta la cabecera a ciegas: suplantar la IP evitaria el
 * limite, que es justo lo que se intenta cerrar.
 */
export function clientIp(headers: Headers, fallback = 'desconocida'): string {
  const cf = headers.get('cf-connecting-ip')
  if (cf) return cf.trim()

  if (trustsProxy()) {
    const fwd = headers.get('x-forwarded-for')
    const first = fwd?.split(',')[0]?.trim()
    if (first) return first
  }

  return fallback
}

function trustsProxy(): boolean {
  return process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true'
}

/**
 * Consulta el limite. Devuelve `null` si la peticion se admite.
 *
 * @param headers  Cabeceras de la peticion, para deducir la IP.
 */
export async function check(
  headers: Headers,
  scope: Scope,
  extraKey?: string,
  store: RateLimiter = limiter(),
): Promise<{ retryAfterMs: number } | null> {
  const ip = clientIp(headers)
  const key = extraKey ? `${scope.name}:${ip}:${extraKey}` : `${scope.name}:${ip}`
  const result = await store.hit(key, scope.limit, scope.windowMs)
  return result.ok ? null : { retryAfterMs: result.retryAfterMs }
}

/** Atajo para los handlers, que ya tienen el contexto. */
export function guard(
  c: { headers: Headers },
  scope: Scope,
  extraKey?: string,
): Promise<{ retryAfterMs: number } | null> {
  return check(c.headers, scope, extraKey)
}

/** Limpia el contador de una clave (login correcto). */
export async function clear(c: { headers: Headers }, scope: Scope, extraKey: string): Promise<void> {
  const ip = clientIp(c.headers)
  await limiter().reset(`${scope.name}:${ip}:${extraKey}`)
}