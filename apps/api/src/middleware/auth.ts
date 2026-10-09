import type { NextFunction, Request, Response } from 'express'
import type { Role, UserRow } from '../db/types.js'
import { forbidden, unauthorized } from '../shared/errors.js'
import { findById, toPublicUser, verifyToken } from '../modules/auth/service.js'
import type { Db } from '../db/connection.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow
      db?: Db
    }
  }
}

export function attachDb(db: Db) {
  return function dbMiddleware(req: Request, _res: Response, next: NextFunction): void {
    req.db = db
    next()
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next(unauthorized())

  try {
    const payload = verifyToken(header.slice(7), 'access')
    req.user = findById(req.db!, payload.sub)
    next()
  } catch (err) {
    next(err)
  }
}

export function requireRole(...roles: Role[]) {
  return function roleMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) return next(unauthorized())
    if (!roles.includes(req.user.role)) {
      return next(forbidden('Tu rol no tiene acceso a esta accion'))
    }
    next()
  }
}

export function requireClient(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized())
  if (req.user.role !== 'client') return next(forbidden())
  next()
}

export function currentUser(req: Request) {
  if (!req.user) throw unauthorized()
  return toPublicUser(req.user)
}
