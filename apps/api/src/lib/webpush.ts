/**
 * Web Push (RFC 8291) sobre WebCrypto.
 *
 * Sustituye a `web-push`, que depende de `crypto` de Node y no se empaqueta en
 * Workers. Cubre lo que el taller necesita: cifrado `aes128gcm` y cabecera
 * VAPID ES256, ambos con primitivas disponibles en WebCrypto.
 *
 * El protocolo es largo y poco intuitivo; los pasos van comentados para poder
 * contrastarlos con la especificacion sin volver a leer el codigo entero.
 */

import { config } from '../config.js'

/* ------------------------------- Utilidades ------------------------------ */

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

function concat(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const encoder = new TextEncoder()

async function hmac(
  secret: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
}

/** HKDF-Expand de RFC 5869, con la sal ya combinada en `prk`. */
async function hkdfExpand(
  prk: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const out: Uint8Array<ArrayBuffer>[] = []
  let previous = new Uint8Array(0)
  let counter = 1
  let size = 0

  while (size < length) {
    previous = await hmac(prk, concat(previous, info, new Uint8Array([counter])))
    out.push(previous)
    size += previous.length
    counter += 1
  }

  return concat(...out).slice(0, length)
}

/* --------------------------------- VAPID --------------------------------- */

const VAPID_HEADER = encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))

/**
 * El `aud` que exige la especificacion es el origen del endpoint: todo lo que
 * precede al path, sin la barra final.
 */
function audienceOf(endpoint: string): string {
  const url = new URL(endpoint)
  return url.origin
}

function vapidKeys() {
  const { publicKey, privateKey } = config.vapid
  const priv = fromBase64url(privateKey)
  const pub = fromBase64url(publicKey)
  return { priv, pub }
}

async function vapidHeaders(audience: string): Promise<Headers> {
  const { priv, pub } = vapidKeys()

  const key = await crypto.subtle.importKey(
    'raw',
    priv,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const header = base64url(VAPID_HEADER)
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: config.vapid.subject,
      }),
    ),
  )
  const data = encoder.encode(`${header}.${payload}`)

  // WebCrypto devuelve la firma ES256 cruda (r||s, 64 bytes), que es justo lo
  // que JWS espera; no hay que reempaquetar a DER.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data),
  )

  const token = `${header}.${payload}.${base64url(signature)}`
  return new Headers({
    TTL: String(12 * 3600),
    Authorization: `vapid t=${token}, k=${base64url(pub)}`,
  })
}

/* -------------------------------- Envio ---------------------------------- */

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
}

/**
 * Cifra el cuerpo con aes128gcm y lo envia al endpoint del push service.
 *
 * Devuelve el status HTTP para que el llamador pueda limpiar las suscripciones
 * muertas (404/410 significan que el navegador tiro la subscription).
 */
export async function sendNotification(
  sub: PushSubscription,
  payload: PushPayload,
): Promise<number> {
  const plaintext = encoder.encode(JSON.stringify(payload))

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const senderKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeys.publicKey),
  ) as unknown as Uint8Array<ArrayBuffer>

  // 1. ECDH compartido con la clave publica del navegador.
  const uaPublic = await crypto.subtle.importKey(
    'raw',
    fromBase64url(sub.keys.p256dh),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublic }, senderKeys.privateKey, 256),
  )

  // 2. HKDF: PRK -> IKM. La `key_info` liga las dos claves publicas para que un
  //    intermediario no pueda reutilizar el material en otro sentido.
  const prk = await hmac(salt, sharedSecret)
  const keyInfo = concat(
    encoder.encode('WebPush: info\0'),
    asPublic,
    fromBase64url(sub.keys.p256dh),
  )
  const ikm = await hmac(prk, concat(keyInfo, new Uint8Array([1])))

  // 3. De `ikm` salen la clave de cifrado, el nonce y el tamano de la clave del
  //    servidor (`rs`), que viaja en la cabecera del registro.
  const cek = await hkdfExpand(ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdfExpand(ikm, encoder.encode('Content-Encoding: nonce\0'), 12)
  const rs = await hkdfExpand(ikm, encoder.encode('Content-Encoding: rs\0'), 4)

  const record = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, plaintext)

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      // El header del registro va como datos asociados: no se puede alterar.
      { name: 'AES-GCM', iv: nonce, additionalData: record.subarray(0, 86) },
      aesKey,
      plaintext,
    ),
  )

  const body = concat(record.subarray(0, 86), ciphertext)

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: await vapidHeaders(audienceOf(sub.endpoint)),
    body,
  })

  // 404/410: hay que eliminar la suscripcion. Liberar el resto de la respuesta
  // evita que el body sin leer se quede retenido.
  if (!res.ok) await res.arrayBuffer().catch(() => undefined)

  return res.status
}

/** Clave publica que el navegador usa al suscribirse. */
export function getVapidPublicKey(): string {
  return config.vapid.publicKey
}

export function isPushEnabled(): boolean {
  return Boolean(config.vapid.publicKey && config.vapid.privateKey)
}
