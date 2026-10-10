/**
 * Hash de contrasenas con PBKDF2-SHA256 sobre WebCrypto.
 *
 * Sustituye a `argon2`, que es un binario nativo y no existe en Workers. PBKDF2
 * si es parte de WebCrypto, asi que corre igual en Node >= 20 y en el isolate.
 *
 * Formato: `$pbkdf2-sha256$<iteraciones>$<sal base64url>$<hash base64url>`
 *
 * Los hashes de argon2 que dejaba el volcado anterior se rechazan aqui: en
 * Workers no hay forma de verificarlos. La base de D1 usa este formato desde
 * el principio.
 */

const ALGO = 'PBKDF2'
const DIGEST = 'SHA-256'
const ITERATIONS = 100_000
const KEY_LENGTH = 32
const SALT_LENGTH = 16

const PREFIX = '$pbkdf2-sha256$'

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

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    ALGO,
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: ALGO, hash: DIGEST, salt, iterations },
    key,
    KEY_LENGTH * 8,
  )
  return new Uint8Array(bits)
}

/** La sal es aleatoria a proposito: dos usuarios con la misma clave no coinciden. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const hash = await derive(password, salt, ITERATIONS)
  return `${PREFIX}${ITERATIONS}$${base64url(salt)}$${base64url(hash)}`
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  if (!stored.startsWith(PREFIX)) return false

  const parts = stored.split('$')
  // ['', 'pbkdf2-sha256', iterations, salt, hash]
  if (parts.length !== 5) return false

  const [, , rawIterations, rawSalt, rawHash] = parts as [string, string, string, string, string]

  const iterations = Number(rawIterations)
  if (!Number.isFinite(iterations) || iterations < 1) return false

  try {
    const salt = fromBase64url(rawSalt)
    const expected = fromBase64url(rawHash)
    const actual = await derive(password, salt, iterations)
    // Comparacion en tiempo constante: comparar byte a byte filtra informacion.
    if (actual.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < actual.length; i += 1) diff |= actual[i]! ^ expected[i]!
    return diff === 0
  } catch {
    return false
  }
}

/** Re-hashea el seed de `pits.sql` sin tocar el formato del resto del volcado. */
export async function isSupportedHash(stored: string): Promise<boolean> {
  return stored.startsWith(PREFIX)
}
