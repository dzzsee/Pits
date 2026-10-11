import { z } from 'zod'
import { notFound, badRequest } from '../../shared/errors.js'
import { validate } from '../../shared/http.js'
import { authenticate, requireRole, Router } from '../../http/router.js'
import { toPublicUser } from '../auth/service.js'
import { hashPassword, passwordProblem } from '../../lib/password.js'
import { revokeAllForUser } from '../auth/sessions.js'
import type { UserRow } from '../../db/types.js'
import { readLoyaltyConfig, updateLoyaltyConfig } from '../loyalty/service.js'
import { reportsCsv, reportsSummary } from '../reports/service.js'

export const adminRouter = new Router()
adminRouter.use(authenticate, requireRole('admin'))

adminRouter.get('/users', async (c) => {
  const role = c.query.get('role')
  // El `?` solo existe si hay filtro. Pasar el argumento igual seria un
  // parametro de mas y el driver lanza: hay que ligar los dos.
  const rows = role
    ? await c.db
        .prepare<[string], UserRow>('SELECT * FROM users WHERE role = ? ORDER BY role, name')
        .all(role)
    : await c.db.prepare<[], UserRow>('SELECT * FROM users ORDER BY role, name').all()
  c.json({ items: rows.map(toPublicUser) })
})

adminRouter.post('/users', async (c) => {
  const body = validate(
    z.object({
      role: z.enum(['client', 'mechanic', 'admin']),
      email: z.string().email(),
      name: z.string().min(2),
      phone: z.string().min(6).max(24).optional(),
      password: z.string().min(8),
    }),
    c.body,
  )

  // El admin da de alta a mecanicos y clientes: la contrasena se fija aqui, y
  // es la unica barrera porque el hash no se puede subir (tope de Workers).
  const weak = passwordProblem(body.password)
  if (weak) throw badRequest(weak)
  const info = await c.db
    .prepare(`INSERT INTO users (role, email, phone, name, password_hash) VALUES (?, ?, ?, ?, ?)`)
    .run(
      body.role,
      body.email.toLowerCase(),
      body.phone ?? null,
      body.name,
      await hashPassword(body.password),
    )
  const id = Number(info.lastInsertRowid)
  if (body.role === 'client') {
    await c.db.prepare('INSERT OR IGNORE INTO loyalty_accounts (client_id) VALUES (?)').run(id)
  }
  c.json(
    toPublicUser(
      (await c.db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id))!,
    ),
    201,
  )
})

adminRouter.patch('/users/:id', async (c) => {
  const body = validate(
    z.object({
      name: z.string().min(2).optional(),
      phone: z.string().min(6).max(24).nullable().optional(),
      isActive: z.boolean().optional(),
      password: z.string().min(8).optional(),
    }),
    c.body,
  )
  const id = Number(c.params.id)
  const user = await c.db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) throw notFound('Usuario no encontrado')

  if (body.name !== undefined || body.phone !== undefined || body.isActive !== undefined) {
    await c.db
      .prepare(
        `UPDATE users SET name = COALESCE(?, name), phone = ?, is_active = COALESCE(?, is_active),
         updated_at = datetime('now') WHERE id = ?`,
      )
      .run(
        body.name ?? null,
        body.phone === undefined ? user.phone : body.phone,
        body.isActive === undefined ? null : body.isActive ? 1 : 0,
        id,
      )
  }
  // Desactivar y resetear contrasena cierran las sesiones abiertas de esa
  // cuenta: si no, el usuario desactivado conservaria el acceso que ya tenia.
  if (body.isActive === false || body.password) {
    await revokeAllForUser(c.db, id)
  }
  if (body.password) {
    const weak = passwordProblem(body.password)
    if (weak) throw badRequest(weak)
    await c.db
      .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(await hashPassword(body.password), id)
  }
  c.json(
    toPublicUser(
      (await c.db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id))!,
    ),
  )
})

/** Config del programa de fidelizacion (regla fija, sin catalogo). */
adminRouter.get('/loyalty-settings', async (c) => {
  c.json(await readLoyaltyConfig(c.db))
})

adminRouter.patch('/loyalty-settings', async (c) => {
  const body = validate(
    z.object({
      pointsPerRepair: z.number().int().min(0).max(1000).optional(),
      pointsPerReward: z.number().int().min(1).max(100_000).optional(),
      rewardLabel: z.string().min(2).max(60).optional(),
      rewardValidDays: z.number().int().min(1).max(3650).optional(),
    }),
    c.body,
  )
  c.json(await updateLoyaltyConfig(c.db, body))
})

adminRouter.get('/reports/summary', async (c) => {
  c.json(await reportsSummary(c.db, { from: c.query.get('from'), to: c.query.get('to') }))
})

adminRouter.get('/reports/export.csv', async (c) => {
  const csv = await reportsCsv(c.db, { from: c.query.get('from'), to: c.query.get('to') })
  c.outHeaders.set('Content-Type', 'text/csv; charset=utf-8')
  c.outHeaders.set('Content-Disposition', 'attachment; filename="pits-reparaciones.csv"')
  c.text(csv)
})
