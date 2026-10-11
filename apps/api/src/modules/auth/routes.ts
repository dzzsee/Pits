import { z } from 'zod'
import { validate } from '../../shared/http.js'
import { authenticate, currentUser, type RouteContext } from '../../http/router.js'
import {
  authenticate as loginUser,
  findById,
  issueTokens,
  register,
  toPublicUser,
  verifyToken,
} from './service.js'
import { clearFailures, inspect, recordFailure } from './lockout.js'
import { revokeAllForUser, revokeSession } from './sessions.js'
import { guard, clear, SCOPES } from '../../http/limits.js'
import { verifyPassword, hashPassword, passwordProblem } from '../../lib/password.js'
import { badRequest, HttpError, tooManyRequests } from '../../shared/errors.js'
import { Router } from '../../http/router.js'

/**
 * El hash va topado por la plataforma (ver `lib/password.ts`), asi que la
 * solidez se exige en la contrasena y no se puede subir a posteriori.
 */
function assertStrongPassword(password: string): void {
  const problem = passwordProblem(password)
  if (problem) throw badRequest(problem)
}

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
  await guard(c, SCOPES.register)
  const body = validate(registerSchema, c.body)
  assertStrongPassword(body.password)
  const user = await register(c.db, body)
  c.json({ user: toPublicUser(user), ...(await issueTokens(c.db, user)) }, 201)
})

authRouter.post('/login', async (c) => {
  const body = validate(loginSchema, c.body)
  const email = body.email.trim().toLowerCase()

  // Dos barreras. El limite por IP corta la reutilizacion desde una maquina;
  // el bloqueo por cuenta (BD) es el que sobrevive al credential stuffing, que
  // reparte los intentos entre muchas IP.
  await guard(c, SCOPES.login, email)

  const lock = await inspect(c.db, email)
  if (lock.locked) throw tooManyRequests('Demasiados intentos. Intentalo mas tarde.', lock.retryAfterMs)

  try {
    const user = await loginUser(c.db, body.email, body.password)
    // Login correcto: el contador vuelve a cero para que un usuario que se
    // equivoco cinco veces no salga penalizado al dia siguiente.
    await clearFailures(c.db, email)
    await clear(c, SCOPES.login, email)
    c.json({ user: toPublicUser(user), ...(await issueTokens(c.db, user)) })
  } catch (err) {
    // Solo cuentan los fallos de credenciales: un 503 o un error de la base de
    // datos no debe llevar a la cuenta a un bloqueo.
    if (err instanceof HttpError && err.status === 401 && !/desactivada/i.test(err.message)) {
      const state = await recordFailure(c.db, email)
      if (state.locked) {
        throw tooManyRequests('Demasiados intentos fallidos. Intentalo mas tarde.', state.retryAfterMs)
      }
    }
    throw err
  }
})

authRouter.post('/refresh', async (c) => {
  await guard(c, SCOPES.refresh)
  const { refreshToken } = validate(z.object({ refreshToken: z.string().min(10) }), c.body)
  const payload = await verifyToken(refreshToken, 'refresh')
  // `findById` rechaza cuentas desactivadas, tokens de una version anterior y
  // sesiones ya cerradas. Sin esto, refrescar reabria una sesion revocada.
  const user = await findById(c.db, payload.sub, payload.ver, payload.sid)
  c.json({ user: toPublicUser(user), ...(await issueTokens(c.db, user)) })
})

/**
 * Cierre de sesion.
 *
 * Acepta el token en el cuerpo a proposito: el navegador lo llama con
 * `navigator.sendBeacon` al cerrar la pestana, y `sendBeacon` no admite
 * cabeceras. Por eso no lleva `authenticate` y valida el token a mano.
 *
 * Siempre responde 200: cerrar la sesion no debe fallar aunque el token ya no
 * sirva, porque el cliente lo que quiere es quedarse sin sesion.
 */
authRouter.post('/logout', async (c) => {
  const { accessToken } = validate(z.object({ accessToken: z.string().min(10) }), c.body)
  try {
    const payload = await verifyToken(accessToken, 'access')
    if (payload.sid) await revokeSession(c.db, payload.sid)
  } catch {
    // Token invalido o caducado: la sesion ya no esta viva. Cerrada de todos modos.
  }
  c.json({ ok: true })
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
  // Reautenticar es lento a proposito (PBKDF2); sin este limite, un token
  // robado podria usarlo para tantear contrasenas actuales.
  await guard(c, SCOPES.password, String(c.user!.id))
  const body = validate(passwordSchema, c.body)
  assertStrongPassword(body.newPassword)
  const user = c.user!
  if (!(await verifyPassword(user.password_hash, body.currentPassword))) {
    throw badRequest('La contrasena actual no coincide')
  }
  await c.db
    .prepare(
      `UPDATE users SET password_hash = ?, token_version = token_version + 1,
         updated_at = datetime('now') WHERE id = ?`,
    )
    .run(await hashPassword(body.newPassword), user.id)
  // `token_version + 1` invalida cualquier token emitido antes, y ademas se
  // cierran las sesiones: cambiar la contrasena por haberla comprometido
  // expulsa a quien la tuviera, en vez de dejarle 30 dias de acceso.
  await revokeAllForUser(c.db, user.id)
  c.json({ ok: true, relogin: true })
})
