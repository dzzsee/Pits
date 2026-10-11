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
/**
 * Iteraciones actuales.
 *
 * **Tope de la plataforma, no una decision de coste.** El WebCrypto de Cloudflare
 * Workers lanza `NotSupportedError` con cualquier valor por encima de 100 000
 * ("iteration counts above 100000 are not supported"), de modo que subirlo
 * rompe el login en produccion aunque en Node y en los tests pase: ahi
 * PBKDF2-SHA256 admite 600 000 y es lo que recomienda OWASP.
 *
 * Aqui no se puede llegar a ese numero. Subir el coste exigiria otro KDF
 * (argon2id o bcrypt), y ambos son binarios nativos que no existen en Workers.
 * La defensa complementaria es la politica de contrasenas del admin al darlas
 * de alta, no el coste del hash.
 *
 * El numero va dentro del hash, asi que `verify` usa el que encuentra y
 * `needsRehash` avisa cuando queda por debajo: subirlo en el futuro no
 * invalida ninguna cuenta existente.
 */
const ITERATIONS = 100_000

/** Por debajo de este valor el hash se rehace en el proximo login correcto. */
const REHASH_AT = 100_000
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
  return hashWithIterations(password, ITERATIONS)
}

/**
 * Hashea con un coste concreto.
 *
 * Solo para tests y para `db:rehash`: permite fabricar un hash *real* al coste
 * antiguo. Reescribir el numero de iteraciones de un hash existente no sirve
 * para simularlo, porque el digest se calculo con otro coste y deja de
 * coincidir.
 */
export async function hashWithIterations(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const hash = await derive(password, salt, iterations)
  return `${PREFIX}${iterations}$${base64url(salt)}$${base64url(hash)}`
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

/**
 * Si el hash guardado quedo por debajo del coste actual y conviene rehacerlo.
 *
 * Se llama tras un login correcto: la contrasena es conocida y legitima en ese
 * momento, que es la unica vez en que se puede re-hashear sin pedirla.
 */
export function needsRehash(stored: string): boolean {
  if (!stored.startsWith(PREFIX)) return false
  const iterations = Number(stored.split('$')[2])
  return !Number.isFinite(iterations) || iterations < REHASH_AT
}

/**
 * Comprueba la solidez de una contrasena en el alta.
 *
 * No sustituye al coste del hash, que en Workers esta topado a 100 000
 * iteraciones, pero evita el caso que mas se da en un taller: contrasenas de
 * cuatro cifras. Devuelve `null` si es aceptable, o el motivo del rechazo.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'La contrasena debe tener al menos 10 caracteres'

  // Una sola clase de caracter (solo digitos, solo letras) se descifra por
  // fuerza bruta en un tiempo razonable con este coste de hash.
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasDigit = /[0-9]/.test(password)
  const classes = [hasLower, hasUpper, hasDigit].filter(Boolean).length
  if (classes < 2) {
    return 'Combina al menos dos tipos: minusculas, mayusculas y numeros'
  }

  // Secuencias y repeticiones: "123456", "aaaaaa", "abcdef".
  if (/(.)\1{3,}/.test(password)) return 'No repitas el mismo caracter varias veces'
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(password)) {
    return 'No uses secuencias seguidas'
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Esa contrasena es demasiado comun'

  return null
}

/** Las que aparecen en cualquier lista de contraseñas filtradas. */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'contrasena',
  'contrasenya',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'admin1234',
  'demo1234',
  'taller123',
  'mecanico1',
  'mecanico123',
  'abc12345',
])

/** Re-hashea el seed de `pits.sql` sin tocar el formato del resto del volcado. */
export async function isSupportedHash(stored: string): Promise<boolean> {
  return stored.startsWith(PREFIX)
}
