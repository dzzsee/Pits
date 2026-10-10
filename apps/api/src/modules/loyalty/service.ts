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

export async function readLoyaltyConfig(db: Db): Promise<LoyaltyConfig> {
  const rows = await db
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

export async function updateLoyaltyConfig(
  db: Db,
  patch: Partial<LoyaltyConfig>,
): Promise<LoyaltyConfig> {
  const map: Record<string, string> = {
    pointsPerRepair: 'points_per_repair',
    pointsPerReward: 'points_per_reward',
    rewardLabel: 'reward_label',
    rewardValidDays: 'reward_valid_days',
  }
  for (const [k, v] of Object.entries(patch)) {
    const key = map[k]
    if (!key || v === undefined) continue
    await setSetting(db, key, String(v))
  }
  return readLoyaltyConfig(db)
}

export async function ensureAccount(db: Db, clientId: number): Promise<LoyaltyAccountRow> {
  await db.prepare('INSERT OR IGNORE INTO loyalty_accounts (client_id) VALUES (?)').run(clientId)
  const row = await db
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
    repairsUntilReward: remaining === 0 ? 0 : Math.ceil(remaining / cfg.pointsPerRepair),
  }
}

/**
 * Convierte `pointsPerReward` puntos en una recompensa disponible. Es la
 * funcion que ejecuta el canje automatico; se expone aparte para poder
 * concederla desde el panel de administracion.
 */
export async function grantRewardTx(db: Db, clientId: number): Promise<RedemptionRow | null> {
  const cfg = await readLoyaltyConfig(db)
  const account = await ensureAccount(db, clientId)
  if (account.points_balance < cfg.pointsPerReward) return null

  await db
    .prepare(
      `UPDATE loyalty_accounts
       SET points_balance = points_balance - ?, updated_at = datetime('now')
       WHERE client_id = ?`,
    )
    .run(cfg.pointsPerReward, clientId)

  const info = await db
    .prepare(
      `INSERT INTO redemptions (client_id, label, code, status, expires_at)
       VALUES (?, ?, ?, 'available', datetime('now', ?))`,
    )
    .run(clientId, cfg.rewardLabel, nextRedemptionCode(), `+${cfg.rewardValidDays} days`)

  const redemption = (await db
    .prepare<[number], RedemptionRow>('SELECT * FROM redemptions WHERE id = ?')
    .get(Number(info.lastInsertRowid)))!

  await db
    .prepare(
      `INSERT INTO ledger_entries (client_id, delta, reason, ref_redemption_id, note)
       VALUES (?, ?, 'reward_granted', ?, ?)`,
    )
    .run(clientId, -cfg.pointsPerReward, redemption.id, `Reward: ${cfg.rewardLabel}`)

  await db
    .prepare(
      `UPDATE loyalty_accounts
       SET rewards_available = rewards_available + 1, updated_at = datetime('now')
       WHERE client_id = ?`,
    )
    .run(clientId)

  return redemption
}

export async function grantReward(db: Db, clientId: number): Promise<RedemptionRow | null> {
  return db.transaction(() => grantRewardTx(db, clientId))
}

export interface AwardResult {
  pointsAwarded: number
  rewardsGranted: RedemptionRow[]
  account: LoyaltyAccountRow
}

/**
 * Suma los puntos de una reparacion entregada y, si el saldo cruza el
 * umbral, materializa la recompensa como canje disponible.
 *
 * `orderId` es opcional para que los ajustes manuales (migraciones, historial
 * previo) puedan usar el mismo camino de awarding.
 */
export async function awardForRepair(
  db: Db,
  clientId: number,
  orderId: number | null,
  opts: { awardPoints?: boolean } = {},
): Promise<AwardResult> {
  const cfg = await readLoyaltyConfig(db)
  const awardPoints = opts.awardPoints ?? true

  const result = await db.transaction(async (): Promise<AwardResult> => {
    await ensureAccount(db, clientId)
    const awarded = awardPoints ? cfg.pointsPerRepair : 0

    if (awarded > 0) {
      await db
        .prepare(
          `UPDATE loyalty_accounts
           SET points_balance = points_balance + ?,
               lifetime_points = lifetime_points + ?,
               updated_at = datetime('now')
           WHERE client_id = ?`,
        )
        .run(awarded, awarded, clientId)
      await db
        .prepare(
          `INSERT INTO ledger_entries (client_id, delta, reason, ref_order_id, note)
           VALUES (?, ?, 'repair', ?, ?)`,
        )
        .run(clientId, awarded, orderId, `Reparacion entregada (+${awarded} pts)`)
    }

    const rewardsGranted: RedemptionRow[] = []
    let guard = 0
    for (;;) {
      if (guard++ > 100) break // salvaguarda: nunca entrar en bucle infinito
      const reward = await grantRewardTx(db, clientId)
      if (!reward) break
      rewardsGranted.push(reward)
    }

    return {
      pointsAwarded: awarded,
      rewardsGranted,
      account: await ensureAccount(db, clientId),
    }
  })

  // Notificaciones fuera de la transaccion: si fallan, los puntos ya estan.
  // Await porque en Workers lo suelto se cancela al cerrar la respuesta.
  if (result.pointsAwarded > 0) {
    await notifyUser(db, clientId, {
      title: `+${result.pointsAwarded} puntos`,
      body: 'Tu reparacion fue entregada. Revisa tu saldo de fidelizacion.',
      kind: 'loyalty',
      orderId,
    })
  }
  for (const r of result.rewardsGranted) {
    await notifyUser(db, clientId, {
      title: `Ganaste: ${r.label}`,
      body: `Tu codigo de canje es ${r.code}`,
      kind: 'loyalty',
      orderId: null,
    })
    await sendPushToUser(db, clientId, {
      title: `Ganaste: ${r.label}`,
      body: `Codigo ${r.code}`,
      data: { url: '/fidelizacion' },
    })
  }

  return result
}

/** Canje manual: el cliente gasta una recompensa disponible. */
export async function redeemReward(
  db: Db,
  clientId: number,
  redemptionId: number,
): Promise<RedemptionRow> {
  const row = await db
    .prepare<[number, number], RedemptionRow>(
      'SELECT * FROM redemptions WHERE id = ? AND client_id = ?',
    )
    .get(redemptionId, clientId)
  if (!row) throw notFound('Recompensa no encontrada')
  if (row.status !== 'available') throw conflict('Esta recompensa ya no esta disponible')

  await db.transaction(async () => {
    await db
      .prepare("UPDATE redemptions SET status = 'used', redeemed_at = datetime('now') WHERE id = ?")
      .run(redemptionId)
    await db
      .prepare(
        `UPDATE loyalty_accounts
         SET rewards_available = MAX(0, rewards_available - 1),
             rewards_redeemed = rewards_redeemed + 1,
             updated_at = datetime('now')
         WHERE client_id = ?`,
      )
      .run(clientId)
    await db
      .prepare(
        `INSERT INTO ledger_entries (client_id, delta, reason, ref_redemption_id, note)
         VALUES (?, 0, 'redeem', ?, ?)`,
      )
      .run(clientId, redemptionId, `Canje de ${row.label} (${row.code})`)
  })

  await notifyUser(db, clientId, {
    title: 'Recompensa canjeada',
    body: `${row.label} - muestra el codigo ${row.code} en recepcion.`,
    kind: 'loyalty',
    orderId: null,
  })

  return (await db
    .prepare<[number], RedemptionRow>('SELECT * FROM redemptions WHERE id = ?')
    .get(redemptionId))!
}

export async function listRedemptions(db: Db, clientId: number): Promise<RedemptionRow[]> {
  return db
    .prepare<[number], RedemptionRow>(
      `SELECT * FROM redemptions WHERE client_id = ? ORDER BY
        CASE status WHEN 'available' THEN 0 WHEN 'used' THEN 1 ELSE 2 END, id DESC`,
    )
    .all(clientId)
}

export async function listLedger(db: Db, clientId: number, limit = 50) {
  return db
    .prepare<
      [number, number],
      {
        id: number
        delta: number
        reason: string
        note: string | null
        created_at: string
        ref_order_id: number | null
      }
    >(
      `SELECT id, delta, reason, note, created_at, ref_order_id
       FROM ledger_entries WHERE client_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(clientId, limit)
}
