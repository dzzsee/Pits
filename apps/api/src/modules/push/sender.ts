import type { Db } from '../../db/connection.js'
import type { PushSubscriptionRow } from '../../db/types.js'
import { getVapidPublicKey, isPushEnabled, sendNotification } from '../../lib/webpush.js'

export { getVapidPublicKey, isPushEnabled }

export async function registerSubscription(
  db: Db,
  userId: number,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth`,
    )
    .run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent ?? null)
}

export async function removeSubscription(db: Db, userId: number, endpoint: string): Promise<void> {
  await db
    .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(userId, endpoint)
}

export async function sendPushToUser(
  db: Db,
  userId: number,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  if (!isPushEnabled()) return

  const subs = await db
    .prepare<[number], PushSubscriptionRow>('SELECT * FROM push_subscriptions WHERE user_id = ?')
    .all(userId)
  if (!subs.length) return

  const stale: string[] = []

  // En paralelo: cada push es una llamada de red a un tercero y no depende de
  // las demas. Los errores se ignoran a proposito: una notificacion fallida no
  // puede tumbar la operacion de negocio que la origino.
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const status = await sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        // 404/410: la suscripcion murio, hay que limpiarla.
        if (status === 404 || status === 410) stale.push(sub.endpoint)
      } catch {
        /* ver arriba */
      }
    }),
  )

  for (const endpoint of stale) {
    await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
  }
}
