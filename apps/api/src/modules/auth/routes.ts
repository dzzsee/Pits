import { z } from 'zod'
import { validate } from '../../shared/http.js'
import { authenticate, currentUser, type RouteContext } from '../../http/router.js'
import {
  authenticate as loginUser,
  findById,
  register,
  signAccess,
  signRefresh,
  toPublicUser,
  verifyToken,
} from './service.js'
import { verifyPassword, hashPassword } from '../../lib/password.js'
import { badRequest } from '../../shared/errors.js'
import { Router } from '../../http/router.js'

export const authRouter = new Router()

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

authRouter.post('/register', async (c) => {
  const body = validate(registerSchema, c.body)
  const user = await register(c.db, body)
  c.json(
    {
      user: toPublicUser(user),
      accessToken: await signAccess(user),
      refreshToken: await signRefresh(user),
    },
    201,
  )
})

authRouter.post('/login', async (c) => {
  const body = validate(loginSchema, c.body)
  const user = await loginUser(c.db, body.email, body.password)
  c.json({
    user: toPublicUser(user),
    accessToken: await signAccess(user),
    refreshToken: await signRefresh(user),
  })
})

authRouter.post('/refresh', async (c) => {
  const { refreshToken } = validate(z.object({ refreshToken: z.string().min(10) }), c.body)
  const payload = await verifyToken(refreshToken, 'refresh')
  const user = await findById(c.db, payload.sub)
  c.json({
    user: toPublicUser(user),
    accessToken: await signAccess(user),
    refreshToken: await signRefresh(user),
  })
})

authRouter.get('/me', authenticate, (c: RouteContext) => {
  c.json({ user: currentUser(c) })
})

const profileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(6).max(24).nullable().optional(),
})

authRouter.patch('/me', authenticate, async (c) => {
  const body = validate(profileSchema, c.body)
  const user = c.user!

  if (body.name !== undefined || body.phone !== undefined) {
    await c.db
      .prepare(
        "UPDATE users SET name = COALESCE(?, name), phone = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(body.name ?? null, body.phone === undefined ? user.phone : body.phone, user.id)
  }
  c.json({ user: toPublicUser(await findById(c.db, user.id)) })
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
})

authRouter.post('/me/password', authenticate, async (c) => {
  const body = validate(passwordSchema, c.body)
  const user = c.user!
  if (!(await verifyPassword(user.password_hash, body.currentPassword))) {
    throw badRequest('La contrasena actual no coincide')
  }
  await c.db
    .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(await hashPassword(body.newPassword), user.id)
  c.json({ ok: true })
})
