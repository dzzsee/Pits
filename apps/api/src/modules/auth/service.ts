import { config } from '../../config.js'
import type { Db } from '../../db/connection.js'
import type { Role, UserRow } from '../../db/types.js'
import { conflict, unauthorized } from '../../shared/errors.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { sign, verify } from '../../lib/jwt.js'

export { hashPassword, verifyPassword }

export interface TokenPayload {
  sub: number
  role: Role
  type: 'access' | 'refresh'
}

export interface PublicUser {
  id: number
  role: Role
  email: string
  phone: string | null
  name: string
  created_at: string
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    role: u.role,
    email: u.email,
    phone: u.phone,
    name: u.name,
    created_at: u.created_at,
  }
}

export async function signAccess(user: Pick<UserRow, 'id' | 'role'>): Promise<string> {
  return sign(
    { sub: user.id, role: user.role, type: 'access' },
    config.jwt.secret,
    config.jwt.accessTtl,
  )
}

export async function signRefresh(user: Pick<UserRow, 'id' | 'role'>): Promise<string> {
  return sign(
    { sub: user.id, role: user.role, type: 'refresh' },
    config.jwt.secret,
    config.jwt.refreshTtl,
  )
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
  return { sub: result.claims.sub, role: result.claims.role as Role, type: result.claims.type }
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
  return user
}

export async function findById(db: Db, id: number): Promise<UserRow> {
  const user = await db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) throw unauthorized('Usuario no encontrado')
  return user
}
