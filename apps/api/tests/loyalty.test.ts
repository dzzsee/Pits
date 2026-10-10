import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db/connection.js'
import { setSetting } from '../src/db/helpers.js'
import {
  awardForRepair,
  ensureAccount,
  grantReward,
  listLedger,
  listRedemptions,
  progressToNextReward,
  readLoyaltyConfig,
  redeemReward,
} from '../src/modules/loyalty/service.js'
import { CLIENT, freshDb, seedUsers } from './helpers.js'

describe('fidelizacion', () => {
  let db: Db

  beforeEach(async () => {
    db = await freshDb()
    await seedUsers(db)
  })

  it('usa la regla por defecto: 5 puntos por reparacion, 25 por recompensa', async () => {
    const cfg = await readLoyaltyConfig(db)
    expect(cfg.pointsPerRepair).toBe(5)
    expect(cfg.pointsPerReward).toBe(25)
    expect(cfg.rewardLabel).toBe('Lavado gratis')
  })

  it('acumula 5 puntos por cada reparacion entregada', async () => {
    await awardForRepair(db, CLIENT.id, null)
    await awardForRepair(db, CLIENT.id, null)
    await awardForRepair(db, CLIENT.id, null)

    expect((await ensureAccount(db, CLIENT.id)).points_balance).toBe(15)
    expect((await ensureAccount(db, CLIENT.id)).lifetime_points).toBe(15)
  })

  it('otorga el lavado al cruzar el umbral de 25 puntos', async () => {
    for (let i = 0; i < 5; i++) await awardForRepair(db, CLIENT.id, null)

    const account = await ensureAccount(db, CLIENT.id)
    expect(account.points_balance).toBe(0)
    expect(account.rewards_available).toBe(1)

    const rewards = await listRedemptions(db, CLIENT.id)
    expect(rewards).toHaveLength(1)
    expect(rewards[0]?.label).toBe('Lavado gratis')
    expect(rewards[0]?.status).toBe('available')
    expect(rewards[0]?.code).toMatch(/^PITS-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('convierte el saldo sobrante en recompensas completas', async () => {
    // 7 reparaciones = 35 puntos: 1 lavado y sobran 10.
    for (let i = 0; i < 7; i++) await awardForRepair(db, CLIENT.id, null)

    const account = await ensureAccount(db, CLIENT.id)
    expect(account.points_balance).toBe(10)
    expect(account.rewards_available).toBe(1)
  })

  it('registra cada movimiento en el ledger sin editar saldos a mano', async () => {
    for (let i = 0; i < 5; i++) await awardForRepair(db, CLIENT.id, null)

    const ledger = await listLedger(db, CLIENT.id)
    const repairs = ledger.filter((e) => e.reason === 'repair')
    const granted = ledger.filter((e) => e.reason === 'reward_granted')

    expect(repairs).toHaveLength(5)
    expect(repairs.reduce((acc, e) => acc + e.delta, 0)).toBe(25)
    expect(granted).toHaveLength(1)
    expect(granted[0]?.delta).toBe(-25)
  })

  it('el saldo nunca queda negativo al otorgar varias recompensas', async () => {
    // 60 puntos forzados deben producir 2 lavados y dejar 10.
    await db
      .prepare(
        'UPDATE loyalty_accounts SET points_balance = 60, lifetime_points = 60 WHERE client_id = ?',
      )
      .run(CLIENT.id)

    await grantReward(db, CLIENT.id)
    await grantReward(db, CLIENT.id)

    const account = await ensureAccount(db, CLIENT.id)
    expect(account.points_balance).toBe(10)
    expect(account.rewards_available).toBe(2)
  })

  it('no otorga recompensa si el saldo no alcanza', async () => {
    expect(await grantReward(db, CLIENT.id)).toBeNull()
  })

  it('el canje del cliente consume la recompensa disponible', async () => {
    for (let i = 0; i < 5; i++) await awardForRepair(db, CLIENT.id, null)
    const reward = (await listRedemptions(db, CLIENT.id))[0]!

    const redeemed = await redeemReward(db, CLIENT.id, reward.id)

    expect(redeemed.status).toBe('used')
    expect(redeemed.redeemed_at).not.toBeNull()
    expect((await ensureAccount(db, CLIENT.id)).rewards_available).toBe(0)
    expect((await ensureAccount(db, CLIENT.id)).rewards_redeemed).toBe(1)
  })

  it('no deja canjar dos veces la misma recompensa', async () => {
    for (let i = 0; i < 5; i++) await awardForRepair(db, CLIENT.id, null)
    const reward = (await listRedemptions(db, CLIENT.id))[0]!

    await redeemReward(db, CLIENT.id, reward.id)
    await expect(redeemReward(db, CLIENT.id, reward.id)).rejects.toThrow(/disponible/i)
  })

  it('el progreso indica cuantas faltan', async () => {
    await awardForRepair(db, CLIENT.id, null)
    await awardForRepair(db, CLIENT.id, null)

    const cfg = await readLoyaltyConfig(db)
    const progress = progressToNextReward(await ensureAccount(db, CLIENT.id), cfg)

    expect(progress.remaining).toBe(15)
    expect(progress.repairsUntilReward).toBe(3)
    expect(progress.percent).toBe(40)
  })

  it('respeta reglas cambiadas por el administrador', async () => {
    await setSetting(db, 'points_per_repair', '10')
    await setSetting(db, 'points_per_reward', '30')
    await setSetting(db, 'reward_label', 'Cambio de aceite')

    await awardForRepair(db, CLIENT.id, null)
    expect((await ensureAccount(db, CLIENT.id)).points_balance).toBe(10)

    await awardForRepair(db, CLIENT.id, null)
    await awardForRepair(db, CLIENT.id, null)

    const rewards = await listRedemptions(db, CLIENT.id)
    expect(rewards).toHaveLength(1)
    expect(rewards[0]?.label).toBe('Cambio de aceite')
  })
})
