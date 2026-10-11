import type { Db } from '../../db/connection.js'

/**
 * Sesiones revocables.
 *
 * El JWT es autocontenido: se valida con la firma y la caducidad, y no hay
 * estado en el servidor. Eso significa que "cerrar sesion" no podia cerrar
 * nada: el navegador olvidaba el token, pero el refresh token (30 dias) seguia
 * valido y servia para obtener tokens nuevos indefinidamente.
 *
 * Aqui cada inicio de sesion crea una fila. El identificador viaja en el token
 * como 'sid', y cerrar sesion consiste en marcar la fila. El token sigue siendo
 * criptograficamente legitimo, pero el servidor lo rechaza porque su sesion ya
 * no esta viva: es la diferencia entre "el cliente lo olvido" y "caduco".
 */

export interface SessionRow {
  id: string
  user_id: number
  created_at: string
  revoked_at: string | null
}

/** Identificador aleatorio: 32 bytes, suficiente y sin colisiones en la practica. */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createSession(db: Db, userId: number): Promise<string> {
  const id = newId()
  await db
    .prepare('INSERT INTO sessions (id, user_id) VALUES (?, ?)')
    .run(id, userId)
  return id
}

/** Cierra la sesion indicada. Idempotente: cerrar dos veces no falla. */
export async function revokeSession(db: Db, id: string): Promise<void> {
  await db
    .prepare(
      "UPDATE sessions SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL",
    )
    .run(id)
}

/** Cierra todas las sesiones de un usuario. */
export async function revokeAllForUser(db: Db, userId: number): Promise<void> {
  await db
    .prepare(
      "UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL",
    )
    .run(userId)
}

/**
 * Si la sesion sigue viva.
 *
 * Un token sin 'sid' es de antes de esta migracion: se acepta, porque si no
 * cualquier sesion abierta en el momento del despliegue quedaria desconectada.
 * En cuanto el usuario vuelva a entrar tendra una sesion revocable.
 */
export async function isLive(db: Db, sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return true

  const row = await db
    .prepare<[string], { revoked_at: string | null }>('SELECT revoked_at FROM sessions WHERE id = ?')
    .get(sessionId)

  // Desconocida: el token no trae sesion nuestra. Se rechaza, que es lo seguro.
  if (!row) return false
  return row.revoked_at === null
}

/**
 * Limpiezaperiodica.
 *
 * Una sesion revocada ya no sirve para nada, pero sus filas se acumulan. Se
 *-called desde el arranque: borrarlas no es critico para la seguridad, solo
 * para que la tabla no crezca sin limite.
 */
export async function pruneSessions(db: Db, olderThanDays = 30): Promise<void> {
  await db
    .prepare(
      `DELETE FROM sessions
        WHERE revoked_at IS NOT NULL
          AND revoked_at < datetime('now', ?)`,
    )
    .run(`-${olderThanDays} days`)
}