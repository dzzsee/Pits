import type { Db } from '../../db/connection.js'
import type { NotificationRow } from '../../db/types.js'
import { emitToStaff, emitToUser } from '../../shared/events.js'

export interface NotifyInput {
  title: string
  body: string
  kind?: NotificationRow['kind']
  orderId?: number | null
}

export function createNotification(db: Db, userId: number, input: NotifyInput): number {
  const info = db
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
  createNotification(db, userId, input)

  emitToUser(userId, { type: 'notification.new' })
  if (input.kind === 'loyalty') emitToUser(userId, { type: 'loyalty.updated' })
  if (input.orderId) {
    const event = { type: 'order.updated' as const, orderId: input.orderId }
    emitToUser(userId, event)
    emitToStaff(event)
  }

  const { sendPushToUser } = await import('../push/sender.js')
  sendPushToUser(db, userId, {
    title: input.title,
    body: input.body,
    data: input.orderId ? { url: `/reparacion/${input.orderId}` } : { url: '/' },
  })
}

export function listNotifications(
  db: Db,
  userId: number,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): { items: NotificationRow[]; unread: number } {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30))
  const items = db
    .prepare<[number, number], NotificationRow>(
      `SELECT * FROM notifications
       WHERE user_id = ? ${opts.unreadOnly ? 'AND read_at IS NULL' : ''}
       ORDER BY id DESC LIMIT ?`,
    )
    .all(userId, limit)
  const unread = db
    .prepare<[number], { n: number }>(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    )
    .get(userId)
  return { items, unread: unread?.n ?? 0 }
}

export function markRead(db: Db, userId: number, id: number): boolean {
  const info = db
    .prepare('UPDATE notifications SET read_at = datetime(\'now\') WHERE id = ? AND user_id = ? AND read_at IS NULL')
    .run(id, userId)
  return info.changes > 0
}

export function markAllRead(db: Db, userId: number): number {
  return Number(
    db
      .prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL")
      .run(userId).changes,
  )
}
