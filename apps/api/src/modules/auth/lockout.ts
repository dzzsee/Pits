import type { Db } from '../../db/connection.js'

/**
 * Bloqueo de cuenta por intentos fallidos.
 *
 * El limite por IP no basta: el credential stuffing reparte los intentos entre
 * muchas IP, asi que sin un contador **por cuenta** un atacante con una lista
 * de correos puede seguir probando indefinidamente. Este modulo lleva el
 * recuento por email normalizado.
 *
 * La clave es el email en minusculas (el mismo criterio que usa el login), no
 * el hash de la contrasena: no se guarda ningun secreto y el indice unico de
 * la tabla es suficiente.
 */

/** Intentos fallidos antes de bloquear la cuenta. */
const MAX_FAILURES = 5
/** Ventana desde la que se cuentan los fallos. */
const WINDOW_MS = 15 * 60 * 1000
/** Primer bloqueo. */
const LOCK_MS = 15 * 60 * 1000
/** Cada bloqueo sucesivo multiplica la espera, hasta este tope. */
const MAX_LOCK_MS = 24 * 60 * 60 * 1000

export interface AttemptState {
  locked: boolean
  /** Milisegundos que faltan para desbloquear. */
  retryAfterMs: number
}

function normalize(email: string): string {
  return email.trim().toLowerCase()
}

/** Registra un fallo. Devuelve si la cuenta ha quedado bloqueada. */
export async function recordFailure(db: Db, email: string): Promise<AttemptState> {
  const key = normalize(email)
  const now = Date.now()

  const row = await db
    .prepare<[string], { failures: number; first_at: number; locked_until: number }>(
      'SELECT failures, first_at, locked_until FROM login_attempts WHERE email = ?',
    )
    .get(key)

  // La ventana es deslizante: al vencerla, el contador empieza de cero.
  const priorFailures = row && now - row.first_at < WINDOW_MS ? row.failures : 0
  const priorFirstAt = row && now - row.first_at < WINDOW_MS ? row.first_at : now
  const failures = priorFailures + 1
  const firstAt = priorFirstAt

  if (failures < MAX_FAILURES) {
    await upsert(db, key, failures, firstAt, 0)
    return { locked: false, retryAfterMs: 0 }
  }

  // Escalar: cada vez que se llega al umbral, la espera se duplica.
  const previousBlocks = row ? Math.max(0, Math.floor(row.locked_until / WINDOW_MS)) : 0
  const lockMs = Math.min(MAX_LOCK_MS, LOCK_MS * 2 ** Math.min(previousBlocks, 6))
  const lockedUntil = now + lockMs

  await upsert(db, key, failures, firstAt, lockedUntil)
  return { locked: true, retryAfterMs: lockMs }
}

/** Limpia el contador tras un login correcto. */
export async function clearFailures(db: Db, email: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE email = ?').run(normalize(email))
}

/** Estado actual sin modificarlo. */
export async function inspect(db: Db, email: string): Promise<AttemptState> {
  const row = await db
    .prepare<[string], { locked_until: number }>(
      'SELECT locked_until FROM login_attempts WHERE email = ?',
    )
    .get(normalize(email))

  const until = row?.locked_until ?? 0
  const remaining = until - Date.now()
  return remaining > 0
    ? { locked: true, retryAfterMs: remaining }
    : { locked: false, retryAfterMs: 0 }
}

async function upsert(
  db: Db,
  email: string,
  failures: number,
  firstAt: number,
  lockedUntil: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_attempts (email, failures, first_at, locked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         failures = excluded.failures,
         first_at = excluded.first_at,
         locked_until = excluded.locked_until`,
    )
    .run(email, failures, firstAt, lockedUntil)
}