import argon2 from 'argon2'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { config } from '../../config.js'
import type { Db } from '../../db/connection.js'
import type { Role, UserRow } from '../../db/types.js'
import { conflict, unauthorized } from '../../shared/errors.js'

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

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain)
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}

export function signAccess(user: Pick<UserRow, 'id' | 'role'>): string {
  const payload: TokenPayload = { sub: user.id, role: user.role, type: 'access' }
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessTtl as SignOptions['expiresIn'] })
}

export function signRefresh(user: Pick<UserRow, 'id' | 'role'>): string {
  const payload: TokenPayload = { sub: user.id, role: user.role, type: 'refresh' }
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.refreshTtl as SignOptions['expiresIn'] })
}

export function verifyToken(token: string, expected: 'access' | 'refresh'): TokenPayload {
  try {
    const payload = jwt.verify(token, config.jwt.secret) as unknown as TokenPayload
    if (payload.type !== expected) throw unauthorized('Token de tipo incorrecto')
    return payload
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      throw unauthorized('Sesion expirada')
    }
    if (err instanceof Error && err.message === 'Token de tipo incorrecto') throw err
    throw unauthorized('Token invalido')
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
  const exists = db.prepare<[string], { id: number }>('SELECT id FROM users WHERE email = ?').get(email)
  if (exists) throw conflict('Ese correo ya esta registrado')

  const role = input.role ?? 'client'
  const hash = await hashPassword(input.password)
  const info = db
    .prepare(
      `INSERT INTO users (role, email, phone, name, password_hash) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(role, email, input.phone?.trim() || null, input.name.trim(), hash)

  const id = Number(info.lastInsertRowid)
  if (role === 'client') {
    db.prepare('INSERT OR IGNORE INTO loyalty_accounts (client_id) VALUES (?)').run(id)
  }

  return db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id)!
}

export async function authenticate(
  db: Db,
  email: string,
  password: string,
): Promise<UserRow> {
  const user = db
    .prepare<[string], UserRow>('SELECT * FROM users WHERE email = ?')
    .get(email.trim().toLowerCase())

  // Mismo mensaje para usuario inexistente y password incorrecto.
  if (!user || !(await verifyPassword(user.password_hash, password))) {
    throw unauthorized('Credenciales incorrectas')
  }
  if (!user.is_active) throw unauthorized('La cuenta esta desactivada')
  return user
}

export function findById(db: Db, id: number): UserRow {
  const user = db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) throw unauthorized('Usuario no encontrado')
  return user
}
