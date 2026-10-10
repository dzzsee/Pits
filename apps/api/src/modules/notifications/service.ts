import type { Db } from '../../db/connection.js'
import type { NotificationRow } from '../../db/types.js'
import { emitToStaff, emitToUser } from '../../shared/events.js'
import { sendPushToUser } from '../push/sender.js'

export interface NotifyInput {
  title: string
  body: string
  kind?: NotificationRow['kind']
  orderId?: number | null
}

export async function createNotification(
  db: Db,
  userId: number,
  input: NotifyInput,
): Promise<number> {
  const info = await db
    .prepare(
      `INSERT INTO notifications (user_id, title, body, kind, order_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(userId, input.title, input.body, input.kind ?? 'info', input.orderId ?? null)
  return Number(info.lastInsertRowid)
}

/**
 * Notifica al usuario y, de paso, abre el canal en vivo: como toda notificacion
 * nace de un cambio real (estado, entrega, canje, factura), este es el punto
 * unico por donde ya se emite. No hay logica duplicada en el dominio.
 */
export async function notifyUser(db: Db, userId: number, input: NotifyInput): Promise<void> {
  await createNotification(db, userId, input)

  emitToUser(userId, { type: 'notification.new' })
  if (input.kind === 'loyalty') emitToUser(userId, { type: 'loyalty.updated' })
  if (input.orderId) {
    const event = { type: 'order.updated' as const, orderId: input.orderId }
    emitToUser(userId, event)
    emitToStaff(event)
  }

  await sendPushToUser(db, userId, {
    title: input.title,
    body: input.body,
    data: input.orderId ? { url: `/reparacion/${input.orderId}` } : { url: '/' },
  })
}

export async function listNotifications(
  db: Db,
  userId: number,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<{ items: NotificationRow[]; unread: number }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30))
  const items = await db
    .prepare<[number, number], NotificationRow>(
      `SELECT * FROM notifications
       WHERE user_id = ? ${opts.unreadOnly ? 'AND read_at IS NULL' : ''}
       ORDER BY id DESC LIMIT ?`,
    )
    .all(userId, limit)
  const unread = await db
    .prepare<[number], { n: number }>(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    )
    .get(userId)
  return { items, unread: unread?.n ?? 0 }
}

export async function markRead(db: Db, userId: number, id: number): Promise<boolean> {
  const info = await db
    .prepare(
      "UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL",
    )
    .run(id, userId)
  return info.changes > 0
}

export async function markAllRead(db: Db, userId: number): Promise<number> {
  const info = await db
    .prepare(
      "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL",
    )
    .run(userId)
  return Number(info.changes)
}
