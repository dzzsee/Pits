import { Router } from 'express'
import { z } from 'zod'
import { notFound } from '../../shared/errors.js'
import { ah, validate } from '../../shared/http.js'
import { authenticate, requireRole } from '../../middleware/auth.js'
import { hashPassword, toPublicUser } from '../auth/service.js'
import type { UserRow } from '../../db/types.js'
import { readLoyaltyConfig, updateLoyaltyConfig } from '../loyalty/service.js'
import { reportsCsv, reportsSummary } from '../reports/service.js'

const router = Router()
router.use(authenticate, requireRole('admin'))

router.get(
  '/users',
  ah(async (req, res) => {
    const role = req.query.role ? String(req.query.role) : null
    // El `?` solo existe si hay filtro. Pasar el argumento igual seria un
    // parametro de mas y el driver lanza: hay que ligar los dos.
    const rows = role
      ? req.db!
          .prepare<[string], UserRow>('SELECT * FROM users WHERE role = ? ORDER BY role, name')
          .all(role)
      : req.db!.prepare<[], UserRow>('SELECT * FROM users ORDER BY role, name').all()
    res.json({ items: rows.map(toPublicUser) })
  }),
)

router.post(
  '/users',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        role: z.enum(['client', 'mechanic', 'admin']),
        email: z.string().email(),
        name: z.string().min(2),
        phone: z.string().min(6).max(24).optional(),
        password: z.string().min(8),
      }),
      req.body,
    )
    const info = req.db!
      .prepare(
        `INSERT INTO users (role, email, phone, name, password_hash) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(body.role, body.email.toLowerCase(), body.phone ?? null, body.name, await hashPassword(body.password))
    const id = Number(info.lastInsertRowid)
    if (body.role === 'client') {
      req.db!.prepare('INSERT OR IGNORE INTO loyalty_accounts (client_id) VALUES (?)').run(id)
    }
    res.status(201).json(toPublicUser(req.db!.prepare<[], UserRow>('SELECT * FROM users WHERE id = ?').get(id)!))
  }),
)

router.patch(
  '/users/:id',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        name: z.string().min(2).optional(),
        phone: z.string().min(6).max(24).nullable().optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(8).optional(),
      }),
      req.body,
    )
    const id = Number(req.params.id)
    const user = req.db!.prepare<[], UserRow>('SELECT * FROM users WHERE id = ?').get(id)
    if (!user) throw notFound('Usuario no encontrado')

    if (body.name !== undefined || body.phone !== undefined || body.isActive !== undefined) {
      req.db!
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
    if (body.password) {
      req.db!.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
        await hashPassword(body.password),
        id,
      )
    }
    res.json(toPublicUser(req.db!.prepare<[], UserRow>('SELECT * FROM users WHERE id = ?').get(id)!))
  }),
)

/** Config del programa de fidelizacion (regla fija, sin catalogo). */
router.get(
  '/loyalty-settings',
  ah(async (req, res) => {
    res.json(readLoyaltyConfig(req.db!))
  }),
)

router.patch(
  '/loyalty-settings',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        pointsPerRepair: z.number().int().min(0).max(1000).optional(),
        pointsPerReward: z.number().int().min(1).max(100_000).optional(),
        rewardLabel: z.string().min(2).max(60).optional(),
        rewardValidDays: z.number().int().min(1).max(3650).optional(),
      }),
      req.body,
    )
    res.json(updateLoyaltyConfig(req.db!, body))
  }),
)

router.get(
  '/reports/summary',
  ah(async (req, res) => {
    res.json(reportsSummary(req.db!, { from: req.query.from, to: req.query.to }))
  }),
)

router.get(
  '/reports/export.csv',
  ah(async (req, res) => {
    const csv = reportsCsv(req.db!, { from: req.query.from, to: req.query.to })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="pits-reparaciones.csv"')
    res.send(csv)
  }),
)

export default router
