/**
 * JWT HS256 minimo sobre WebCrypto.
 *
 * Sustituye a `jsonwebtoken`, que depende de `crypto` de Node y no se puede
 * empaquetar en Workers. Solo se necesita firmar y verificar HS256 con una
 * clave compartida, asi que cabe en unas 60 lineas sin arrastrar dependencias.
 */

const ALGO = { name: 'HMAC', hash: 'SHA-256' } as const

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array<ArrayBuffer>): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), ALGO, false, ['sign', 'verify'])
}

export interface Claims {
  sub: number
  role: string
  type: 'access' | 'refresh'
  iat: number
  exp: number
}

export type TokenError = 'expired' | 'invalid'

/** `15m`, `30d`, `12h`... Igual que la sintaxis de jsonwebtoken. */
export function parseTtl(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim())
  if (!match) throw new Error(`TTL invalido: ${ttl}`)
  const value = Number(match[1])
  const unit = { s: 1, m: 60, h: 3600, d: 86_400 }[match[2] as 's' | 'm' | 'h' | 'd']
  return value * unit
}

export async function sign(
  payload: Omit<Claims, 'iat' | 'exp'>,
  secret: string,
  ttl: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claims: Claims = { ...payload, iat: now, exp: now + parseTtl(ttl) }
  const head = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64url(encoder.encode(JSON.stringify(claims)))
  const data = `${head}.${body}`
  const sig = await crypto.subtle.sign(ALGO, await key(secret), encoder.encode(data))
  return `${data}.${base64url(new Uint8Array(sig))}`
}

export async function verify(
  token: string,
  secret: string,
): Promise<{ ok: true; claims: Claims } | { ok: false; error: TokenError }> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, error: 'invalid' }

  const [head, body, sig] = parts as [string, string, string]
  const valid = await crypto.subtle.verify(
    ALGO,
    await key(secret),
    fromBase64url(sig),
    encoder.encode(`${head}.${body}`),
  )
  if (!valid) return { ok: false, error: 'invalid' }

  let claims: Claims
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as Claims
  } catch {
    return { ok: false, error: 'invalid' }
  }

  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    return { ok: false, error: 'expired' }
  }
  return { ok: true, claims }
}
