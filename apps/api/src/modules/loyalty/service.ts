import type { Db } from '../../db/connection.js'
import { nextRedemptionCode, setSetting } from '../../db/helpers.js'
import type { LoyaltyAccountRow, RedemptionRow } from '../../db/types.js'
import { conflict, notFound } from '../../shared/errors.js'
import { sendPushToUser } from '../push/sender.js'
import { notifyUser } from '../notifications/service.js'

export interface LoyaltyConfig {
  pointsPerRepair: number
  pointsPerReward: number
  rewardLabel: string
  rewardValidDays: number
}

export function readLoyaltyConfig(db: Db): LoyaltyConfig {
  const rows = db
    .prepare<[], { key: string; value: string }>('SELECT key, value FROM settings')
    .all()
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const perRepair = Number(map.points_per_repair ?? 5)
  const perReward = Number(map.points_per_reward ?? 25)
  const validDays = Number(map.reward_valid_days ?? 180)

  return {
    pointsPerRepair: Number.isFinite(perRepair) && perRepair > 0 ? perRepair : 5,
    pointsPerReward: Number.isFinite(perReward) && perReward > 0 ? perReward : 25,
    rewardLabel: map.reward_label ?? 'Lavado gratis',
    rewardValidDays: Number.isFinite(validDays) && validDays > 0 ? validDays : 180,
  }
}

export function updateLoyaltyConfig(db: Db, patch: Partial<LoyaltyConfig>): LoyaltyConfig {
  const map: Record<string, string> = {
    pointsPerRepair: 'points_per_repair',
    pointsPerReward: 'points_per_reward',
    rewardLabel: 'reward_label',
    rewardValidDays: 'reward_valid_days',
  }
  for (const [k, v] of Object.entries(patch)) {
    const key = map[k]
    if (!key || v === undefined) continue
    setSetting(db, key, String(v))
  }
  return readLoyaltyConfig(db)
}

export function ensureAccount(db: Db, clientId: number): LoyaltyAccountRow {
  db.prepare('INSERT OR IGNORE INTO loyalty_accounts (client_id) VALUES (?)').run(clientId)
  const row = db
    .prepare<[number], LoyaltyAccountRow>('SELECT * FROM loyalty_accounts WHERE client_id = ?')
    .get(clientId)
  if (!row) throw notFound('Cuenta de fidelizacion no encontrada')
  return row
}

/** Como falta el saldo, devuelve cuantos faltan para la proxima recompensa. */
export function progressToNextReward(account: LoyaltyAccountRow, cfg: LoyaltyConfig) {
  const remaining = Math.max(0, cfg.pointsPerReward - account.points_balance)
  const pct = Math.min(100, Math.round((account.points_balance / cfg.pointsPerReward) * 100))
  return {
    remaining,
    percent: pct,
    repairsUntilReward:
      remaining === 0
        ? 0
        : Math.ceil(remaining / cfg.pointsPerRepair),
  }
}

/**
 * Convierte `pointsPerReward` puntos en una recompensa disponible. Es la
 * funcion que ejecuta el canje automatico; se expone aparte para poder
 * concederla desde el panel de administracion.
 */
export function grantRewardTx(db: Db, clientId: number): RedemptionRow | null {
  const cfg = readLoyaltyConfig(db)
  const account = ensureAccount(db, clientId)
  if (account.points_balance < cfg.pointsPerReward) return null

  db.prepare(
    `UPDATE loyalty_accounts
     SET points_balance = points_balance - ?, updated_at = datetime('now')
     WHERE client_id = ?`,
  ).run(cfg.pointsPerReward, clientId)

  const info = db
    .prepare(
      `INSERT INTO redemptions (client_id, label, code, status, expires_at)
       VALUES (?, ?, ?, 'available', datetime('now', ?))`,
    )
    .run(clientId, cfg.rewardLabel, nextRedemptionCode(), `+${cfg.rewardValidDays} days`)

  const redemption = db
    .prepare<[number], RedemptionRow>('SELECT * FROM redemptions WHERE id = ?')
    .get(Number(info.lastInsertRowid))!

  db.prepare(
    `INSERT INTO ledger_entries (client_id, delta, reason, ref_redemption_id, note)
     VALUES (?, ?, 'reward_granted', ?, ?)`,
  ).run(clientId, -cfg.pointsPerReward, redemption.id, `Reward: ${cfg.rewardLabel}`)

  db.prepare(
    `UPDATE loyalty_accounts
     SET rewards_available = rewards_available + 1, updated_at = datetime('now')
     WHERE client_id = ?`,
  ).run(clientId)

  return redemption
}

export function grantReward(db: Db, clientId: number): RedemptionRow | null {
  return db.transaction(() => grantRewardTx(db, clientId))()
}

export interface AwardResult {
  pointsAwarded: number
  rewardsGranted: RedemptionRow[]
  account: LoyaltyAccountRow
}

/**
 * Suma los puntos de una reparacion entregada y, si el saldo cruza el
 * umbral, materializa la recompensa como canje disponible.
 * Todo en una transaccion: el ledger es la fuente de verdad.
 *
 * `orderId` es opcional para que los ajustes manuales (migraciones, historial
 * previo) puedan usar el mismo camino de awarding.
 */
export function awardForRepair(
  db: Db,
  clientId: number,
  orderId: number | null,
  opts: { awardPoints?: boolean } = {},
): AwardResult {
  const cfg = readLoyaltyConfig(db)
  const awardPoints = opts.awardPoints ?? true

  const tx = db.transaction((): AwardResult => {
    ensureAccount(db, clientId)
    const awarded = awardPoints ? cfg.pointsPerRepair : 0

    if (awarded > 0) {
      db.prepare(
        `UPDATE loyalty_accounts
         SET points_balance = points_balance + ?,
             lifetime_points = lifetime_points + ?,
             updated_at = datetime('now')
         WHERE client_id = ?`,
      ).run(awarded, awarded, clientId)
      db.prepare(
        `INSERT INTO ledger_entries (client_id, delta, reason, ref_order_id, note)
         VALUES (?, ?, 'repair', ?, ?)`,
      ).run(clientId, awarded, orderId, `Reparacion entregada (+${awarded} pts)`)
    }

    const rewardsGranted: RedemptionRow[] = []
    let guard = 0
    for (;;) {
      if (guard++ > 100) break // salvaguarda: nunca entrar en bucle infinito
      const reward = grantRewardTx(db, clientId)
      if (!reward) break
      rewardsGranted.push(reward)
    }

    return { pointsAwarded: awarded, rewardsGranted, account: ensureAccount(db, clientId) }
  })

  const result = tx()

  // Notificaciones fuera de la transaccion: si fallan, los puntos ya están.
  if (result.pointsAwarded > 0) {
    notifyUser(db, clientId, {
      title: `+${result.pointsAwarded} puntos`,
      body: 'Tu reparacion fue entregada. Revisa tu saldo de fidelizacion.',
      kind: 'loyalty',
      orderId,
    }).catch(() => undefined)
  }
  for (const r of result.rewardsGranted) {
    notifyUser(db, clientId, {
      title: `Ganaste: ${r.label}`,
      body: `Tu codigo de canje es ${r.code}`,
      kind: 'loyalty',
      orderId: null,
    }).catch(() => undefined)
    sendPushToUser(db, clientId, {
      title: `Ganaste: ${r.label}`,
      body: `Codigo ${r.code}`,
      data: { url: '/fidelizacion' },
    })
  }

  return result
}

/** Canje manual: el cliente gasta una recompensa disponible. */
export function redeemReward(db: Db, clientId: number, redemptionId: number): RedemptionRow {
  const row = db
    .prepare<[number, number], RedemptionRow>(
      'SELECT * FROM redemptions WHERE id = ? AND client_id = ?',
    )
    .get(redemptionId, clientId)
  if (!row) throw notFound('Recompensa no encontrada')
  if (row.status !== 'available') throw conflict('Esta recompensa ya no esta disponible')

  const cfg = readLoyaltyConfig(db)
  const tx = db.transaction(() => {
    db.prepare("UPDATE redemptions SET status = 'used', redeemed_at = datetime('now') WHERE id = ?").run(
      redemptionId,
    )
    db.prepare(
      `UPDATE loyalty_accounts
       SET rewards_available = MAX(0, rewards_available - 1),
           rewards_redeemed = rewards_redeemed + 1,
           updated_at = datetime('now')
       WHERE client_id = ?`,
    ).run(clientId)
    db.prepare(
      `INSERT INTO ledger_entries (client_id, delta, reason, ref_redemption_id, note)
       VALUES (?, 0, 'redeem', ?, ?)`,
    ).run(clientId, redemptionId, `Canje de ${row.label} (${row.code})`)
  })
  tx()

  notifyUser(db, clientId, {
    title: 'Recompensa canjeada',
    body: `${row.label} - muestra el codigo ${row.code} en recepcion.`,
    kind: 'loyalty',
    orderId: null,
  }).catch(() => undefined)

  void cfg
  return db.prepare<[number], RedemptionRow>('SELECT * FROM redemptions WHERE id = ?').get(redemptionId)!
}

export function listRedemptions(db: Db, clientId: number): RedemptionRow[] {
  return db
    .prepare<[number], RedemptionRow>(
      `SELECT * FROM redemptions WHERE client_id = ? ORDER BY
        CASE status WHEN 'available' THEN 0 WHEN 'used' THEN 1 ELSE 2 END, id DESC`,
    )
    .all(clientId)
}

export function listLedger(db: Db, clientId: number, limit = 50) {
  return db
    .prepare<[number, number], {
      id: number
      delta: number
      reason: string
      note: string | null
      created_at: string
      ref_order_id: number | null
    }>(
      `SELECT id, delta, reason, note, created_at, ref_order_id
       FROM ledger_entries WHERE client_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(clientId, limit)
}
