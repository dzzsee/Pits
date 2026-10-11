/**
 * Deja el taller en blanco: sin ordenes, clientes, vehiculos ni datos de demo.
 *
 * Borra el contenido de todas las tablas de negocio, conserva el esquema, los
 * ajustes, los estados sugeridos y **solo el administrador**. Es lo que hace
 * falta para entregar una instalacion a un taller real sin arrastrar a Ana,
 * Carlos, Luis y los mecanicos de prueba.
 *
 *   npm run db:wipe -w @pits/api
 *
 * Solo afecta a la base local de desarrollo. La de D1 se limpia a mano con
 * `wrangler d1 execute` (ver el README): no se borra desde aqui porque
 * cualquier error en este script se ejecutaria contra datos de produccion.
 */
import { config } from '../src/config.js'
import { closeDb, getDb, type Db } from '../src/db/connection.js'
import { DEFAULT_SETTINGS, setSetting, slugify } from '../src/db/helpers.js'
import { hashPassword } from '../src/lib/password.js'

/**
 * Orden de borrado.
 *
 * Las claves foraneas apuntan hacia estas tablas, asi que el orden es el
 * inverso al de creacion. Con `PRAGMA foreign_keys` activo, borrar en otro
 * orden falla a mitad y deja la base inconsistente.
 */
const DATA_TABLES = [
  'ledger_entries',
  'redemptions',
  'invoices',
  'order_items',
  'state_events',
  'notifications',
  'repair_orders',
  'vehicles',
  'loyalty_accounts',
  'push_subscriptions',
  'sessions',
  'login_attempts',
]

/** Los estados que el taller recibe de partida, los mismos que siembra `seed`. */
const SUGGESTED_STATES = [
  { label: 'Recibido', color: 'slate', isTerminal: false },
  { label: 'Diagnóstico', color: 'sky', isTerminal: false },
  { label: 'En reparación', color: 'amber', isTerminal: false },
  { label: 'Control de calidad', color: 'violet', isTerminal: false },
  { label: 'Listo para entregar', color: 'emerald', isTerminal: false },
  { label: 'Entregado', color: 'emerald', isTerminal: true },
]

/**
 * Usuarios que sobreviven.
 *
 * Se conservan los administradores que ya existen, mas el configurado en
 * `.env`. Cualquier otro usuario (mecanico o cliente) se borra: dar de alta al
 * personal es parte de installing el taller, no del estado inicial.
 */
async function wipe(db: Db): Promise<void> {
  for (const table of DATA_TABLES) {
    const res = await db.prepare(`DELETE FROM ${table}`).run()
    if (Number(res.changes) > 0) console.log(`  ${table}: ${res.changes}`)
  }

  // Estados: se dejan solo los sugeridos, en su orden, para que el taller los
  // renombre, coloree o archive segun su manera de trabajar.
  await db.prepare('DELETE FROM repair_states').run()
  const insert = db.prepare(
    `INSERT INTO repair_states (key, label, color, position, is_suggested, is_custom, is_terminal)
     VALUES (?, ?, ?, ?, 1, 0, ?)`,
  )
  for (const [i, s] of SUGGESTED_STATES.entries()) {
    await insert.run(slugify(s.label), s.label, s.color, i, s.isTerminal ? 1 : 0)
  }
  console.log(`  repair_states: ${SUGGESTED_STATES.length} sugeridos`)

  // Usuarios: fuera todos menos los administradores y el admin configurado.
  await db.prepare("DELETE FROM users WHERE role != 'admin'").run()

  const email = config.seed.adminEmail.trim().toLowerCase()
  const existing = await db
    .prepare<[string], { id: number }>('SELECT id FROM users WHERE email = ?')
    .get(email)

  if (existing) {
    // Se reactiva y se guarantee que pueda entrar.
    await db
      .prepare(
        "UPDATE users SET is_active = 1, password_hash = ?, token_version = token_version + 1 WHERE id = ?",
      )
      .run(await hashPassword(config.seed.adminPassword), existing.id)
    console.log(`  admin conservado: ${email}`)
  } else {
    const id = Number(
      (
        await db
          .prepare(
            `INSERT INTO users (role, email, name, password_hash)
             VALUES ('admin', ?, 'Administrador Pits', ?)`,
          )
          .run(email, await hashPassword(config.seed.adminPassword))
      ).lastInsertRowid,
    )
    console.log(`  admin creado: ${email} (id ${id})`)
  }

  // Ajustes base por si la base venia vacia.
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const found = await db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(key)
    if (!found) await setSetting(db, key, value)
  }

  // Los contadores de numeracion vuelven a cero: si no, el siguiente taller
  // empieza en PITS-2026-0042 sin saber por que.
  await db.prepare('DELETE FROM counters').run()
}

async function main(): Promise<void> {
  const db = await getDb()
  console.log('\n  Limpiando el taller...')
  await wipe(db)
  console.log('  Listo. Queda solo el administrador.\n')
  await closeDb()
}

await main()