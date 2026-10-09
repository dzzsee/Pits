import { Router } from 'express'
import { z } from 'zod'
import { ah, validate } from '../../shared/http.js'
import { authenticate, currentUser } from '../../middleware/auth.js'
import {
  authenticate as loginUser,
  findById,
  register,
  signAccess,
  signRefresh,
  toPublicUser,
  verifyToken,
} from './service.js'
import { badRequest } from '../../shared/errors.js'

const router = Router()

const registerSchema = z.object({
  email: z.string().email('Correo invalido'),
  password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
  name: z.string().min(2, 'Escribe tu nombre'),
  phone: z.string().min(6).max(24).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post(
  '/register',
  ah(async (req, res) => {
    const body = validate(registerSchema, req.body)
    const user = await register(req.db!, body)
    res.status(201).json({
      user: toPublicUser(user),
      accessToken: signAccess(user),
      refreshToken: signRefresh(user),
    })
  }),
)

router.post(
  '/login',
  ah(async (req, res) => {
    const body = validate(loginSchema, req.body)
    const user = await loginUser(req.db!, body.email, body.password)
    res.json({
      user: toPublicUser(user),
      accessToken: signAccess(user),
      refreshToken: signRefresh(user),
    })
  }),
)

router.post(
  '/refresh',
  ah(async (req, res) => {
    const { refreshToken } = validate(z.object({ refreshToken: z.string().min(10) }), req.body)
    const payload = verifyToken(refreshToken, 'refresh')
    const user = findById(req.db!, payload.sub)
    res.json({
      user: toPublicUser(user),
      accessToken: signAccess(user),
      refreshToken: signRefresh(user),
    })
  }),
)

router.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    res.json({ user: currentUser(req) })
  }),
)

const profileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(6).max(24).nullable().optional(),
})

router.patch(
  '/me',
  authenticate,
  ah(async (req, res) => {
    const body = validate(profileSchema, req.body)
    const user = req.user!

    if (body.name !== undefined || body.phone !== undefined) {
      req.db!
        .prepare("UPDATE users SET name = COALESCE(?, name), phone = ?, updated_at = datetime('now') WHERE id = ?")
        .run(body.name ?? null, body.phone === undefined ? user.phone : body.phone, user.id)
    }
    res.json({ user: toPublicUser(findById(req.db!, user.id)) })
  }),
)

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
})

router.post(
  '/me/password',
  authenticate,
  ah(async (req, res) => {
    const body = validate(passwordSchema, req.body)
    const { verifyPassword, hashPassword } = await import('./service.js')
    const user = req.user!
    if (!(await verifyPassword(user.password_hash, body.currentPassword))) {
      throw badRequest('La contrasena actual no coincide')
    }
    req.db!.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      await hashPassword(body.newPassword),
      user.id,
    )
    res.json({ ok: true })
  }),
)

export default router
