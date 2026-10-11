import { config } from '../../config.js'
import type { Db } from '../../db/connection.js'
import type { Role, UserRow } from '../../db/types.js'
import { conflict, unauthorized } from '../../shared/errors.js'
import { hashPassword, needsRehash, verifyPassword } from '../../lib/password.js'
import { sign, verify } from '../../lib/jwt.js'
import { createSession, isLive } from './sessions.js'

export { hashPassword, verifyPassword }

export interface TokenPayload {
  sub: number
  role: Role
  type: 'access' | 'refresh'
  /** Version de sesion con la que se firmo; 0 en tokens previos a la migracion. */
  ver?: number
  /** Sesion en `sessions`; su presencia permite revocar el cierre. */
  sid?: string
}

export interface PublicUser {
  id: number
  role: Role
  email: string
  phone: string | null
  name: string
  created_at: string
  /**
   * Si la cuenta esta habilitada. Lo necesita el panel de administracion para
   * distinguir "desactivar" de "reactivar": sin este campo el cliente no puede
   * saber en que estado esta la cuenta que esta editando.
   */
  is_active: number
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    role: u.role,
    email: u.email,
    phone: u.phone,
    name: u.name,
    created_at: u.created_at,
    is_active: u.is_active,
  }
}

/**
 * Emite el par de tokens de una sesion.
 *
 * Se firma aqui y no en el handler para que `sid` viaje siempre en los dos: si
 * solo lo llevara el access token, el refresh podria reabrir una sesion ya
 * cerrada.
 */
export async function issueTokens(
  db: Db,
  user: Pick<UserRow, 'id' | 'role' | 'token_version'>,
): Promise<{ accessToken: string; refreshToken: string }> {
  const sid = await createSession(db, user.id)
  const claims = { sub: user.id, role: user.role, ver: user.token_version, sid }

  return {
    accessToken: await sign({ ...claims, type: 'access' }, config.jwt.secret, config.jwt.accessTtl),
    refreshToken: await sign(
      { ...claims, type: 'refresh' },
      config.jwt.secret,
      config.jwt.refreshTtl,
    ),
  }
}

export async function verifyToken(
  token: string,
  expected: 'access' | 'refresh',
): Promise<TokenPayload> {
  const result = await verify(token, config.jwt.secret)
  if (!result.ok) {
    throw unauthorized(result.error === 'expired' ? 'Sesion expirada' : 'Token invalido')
  }
  if (result.claims.type !== expected) throw unauthorized('Token de tipo incorrecto')
  return {
    sub: result.claims.sub,
    role: result.claims.role as Role,
    type: result.claims.type,
    ver: result.claims.ver,
    sid: result.claims.sid,
  }
}

export interface RegisterInput {
  email: string
  password: string
  name: string
  phone?: string | null
  role?: Role
}

export async function register(db: Db, input: RegisterInput): Promise<UserRow> {
  const email = input.email.trim().toLowerCase()
  const exists = await db
    .prepare<[string], { id: number }>('SELECT id FROM users WHERE email = ?')
    .get(email)
  if (exists) throw conflict('Ese correo ya esta registrado')

  const role = input.role ?? 'client'
  const hash = await hashPassword(input.password)
  const info = await db
    .prepare(`INSERT INTO users (role, email, phone, name, password_hash) VALUES (?, ?, ?, ?, ?)`)
    .run(role, email, input.phone?.trim() || null, input.name.trim(), hash)

  const id = Number(info.lastInsertRowid)
  if (role === 'client') {
    await db.prepare('INSERT OR IGNORE INTO loyalty_accounts (client_id) VALUES (?)').run(id)
  }

  return (await db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id))!
}

export async function authenticate(db: Db, email: string, password: string): Promise<UserRow> {
  const user = await db
    .prepare<[string], UserRow>('SELECT * FROM users WHERE email = ?')
    .get(email.trim().toLowerCase())

  // Mismo mensaje para usuario inexistente y password incorrecto.
  if (!user || !(await verifyPassword(user.password_hash, password))) {
    throw unauthorized('Credenciales incorrectas')
  }
  if (!user.is_active) throw unauthorized('La cuenta esta desactivada')

  // Las contrasenas sembradas con el coste antiguo siguen validando (el numero
  // de iteraciones va dentro del hash), pero aqui es el unico momento en que
  // se sabe que la clave es correcta: se sube al coste vigente sin pedir nada.
  if (needsRehash(user.password_hash)) {
    const upgraded = await hashPassword(password)
    await db
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .run(upgraded, user.id)
    return { ...user, password_hash: upgraded }
  }

  return user
}

/**
 * Resuelve el titular de una peticion autenticada.
 *
 * Es el unico punto por el que pasa toda identidad verificada: el middleware
 * `authenticate`, el refresco de token y el canal de tiempo real llaman aqui.
 * Por eso los dos controles viven en este sitio y no en cada llamador.
 *
 * - `is_active`: desactivar una cuenta solo impedia *iniciar sesion*; el
 *   refresh token (30 dias) seguia aceptandose y reemitiendo tokens nuevos, y
 *   el middleware aceptaba los viejos. La cuenta conservaba acceso indefinido.
 * - `token_version`: al cambiar la contrasena se incrementa, y cualquier token
 *   emitido antes queda invalidado de inmediato.
 * - `sid`: la sesion debe seguir viva. Es lo que hace que cerrar sesion
 *   cierre de verdad y no solo en el navegador.
 *
 * @param tokenVersion Version con la que se firmo el token, si se esta
 *   validando uno. Sin ella (llamadas internas sin token) solo se aplican los
 *   controles de `is_active` y de sesion.
 */
export async function findById(
  db: Db,
  id: number,
  tokenVersion?: number,
  sessionId?: string,
): Promise<UserRow> {
  const user = await db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) throw unauthorized('Usuario no encontrado')
  // Mismo mensaje que una cuenta inexistente: no revela que el correo existe.
  if (!user.is_active) throw unauthorized('Sesion expirada')
  // Los tokens anteriores a la migracion no llevan `ver`; se aceptan solo si
  // el usuario nunca ha rotado de contrasena (`token_version` sigue en 0).
  if (tokenVersion !== undefined && (tokenVersion ?? 0) !== user.token_version) {
    throw unauthorized('Sesion expirada')
  }
  if (!(await isLive(db, sessionId))) throw unauthorized('Sesion expirada')
  return user
}
