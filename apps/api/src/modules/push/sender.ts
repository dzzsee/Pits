import webpush from 'web-push'
import { config, pushEnabled } from '../../config.js'
import type { Db } from '../../db/connection.js'
import type { PushSubscriptionRow } from '../../db/types.js'

let configured = false

function ensureConfigured(): boolean {
  if (!pushEnabled) return false
  if (!configured) {
    webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey)
    configured = true
  }
  return true
}

export function isPushEnabled(): boolean {
  return pushEnabled
}

export function getVapidPublicKey(): string {
  return pushEnabled ? config.vapid.publicKey : ''
}

export function registerSubscription(
  db: Db,
  userId: number,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
): void {
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth`,
  ).run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent ?? null)
}

export function removeSubscription(db: Db, userId: number, endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint)
}

export function sendPushToUser(
  db: Db,
  userId: number,
  payload: { title: string; body: string; data?: Record<string, string> },
): void {
  if (!ensureConfigured()) return

  const subs = db
    .prepare<[number], PushSubscriptionRow>('SELECT * FROM push_subscriptions WHERE user_id = ?')
    .all(userId)
  if (!subs.length) return

  const body = JSON.stringify(payload)
  const stale: string[] = []

  for (const sub of subs) {
    webpush
      .sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 60 * 60 * 12 },
      )
      .catch((err: { statusCode?: number }) => {
        // 404/410: la suscripcion murio, hay que limpiarla.
        if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(sub.endpoint)
      })
  }

  for (const endpoint of stale) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
  }
}
