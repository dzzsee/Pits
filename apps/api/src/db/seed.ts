import argon2 from 'argon2'
import { config } from '../config.js'
import { closeDb, getBootstrapSource, getDb, type Db } from './connection.js'
import { DEFAULT_SETTINGS, setSetting, slugify } from './helpers.js'
import { seedDemoData } from './seed-demo.js'

const SUGGESTED_STATES = [
  { label: 'Recibido', color: 'slate', isTerminal: false },
  { label: 'Diagnóstico', color: 'sky', isTerminal: false },
  { label: 'En reparación', color: 'amber', isTerminal: false },
  { label: 'Control de calidad', color: 'violet', isTerminal: false },
  { label: 'Listo para entregar', color: 'emerald', isTerminal: false },
  { label: 'Entregado', color: 'emerald', isTerminal: true },
]

/**
 * Siembra el taller: ajustes, estados sugeridos, admin y datos de demo.
 *
 * Recibe la base para poder sembrar tambien una temporal (ver
 * `scripts/make-dump.ts`), sin depender de la instancia global.
 *
 * @param target  Base a sembrar. Por defecto, la global.
 * @param force   Siembra aunque la base venga del volcado `pits.sql`.
 */
export async function seed(target?: Db, opts: { force?: boolean } = {}): Promise<void> {
  const db = target ?? getDb()

  // Si la base viene del volcado `pits.sql` ya trae sus datos: sembrar encima
  // metería clientes de demo en una instalación real. Solo se siembra cuando la
  // base se construyó desde cero con migraciones, o cuando se pide `force`.
  if (!target && !opts.force && getBootstrapSource() === 'dump') {
    console.log(`Base cargada desde ${config.seedSqlPath}`)
    return
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(key)
    if (!existing) setSetting(db, key, value)
  }

  const insertState = db.prepare(
    `INSERT INTO repair_states (key, label, color, position, is_suggested, is_custom, is_terminal)
     VALUES (?, ?, ?, ?, 1, 0, ?)
     ON CONFLICT(key) DO NOTHING`,
  )
  SUGGESTED_STATES.forEach((s, i) =>
    insertState.run(slugify(s.label), s.label, s.color, i, s.isTerminal ? 1 : 0),
  )

  const existingAdmin = db
    .prepare<[string], { id: number }>('SELECT id FROM users WHERE email = ?')
    .get(config.seed.adminEmail)

  if (existingAdmin) {
    console.log(`Admin ya existe: ${config.seed.adminEmail}`)
  } else {
    const hash = await argon2.hash(config.seed.adminPassword)
    db.prepare(
      `INSERT INTO users (role, email, name, password_hash)
       VALUES ('admin', ?, ?, ?)`,
    ).run(config.seed.adminEmail, 'Administrador Pits', hash)
    console.log(`Admin creado: ${config.seed.adminEmail} / ${config.seed.adminPassword}`)
  }

  // Datos de demo, solo si no hay clientes todavía. Un taller real no debe
  // sembrarse con Ana, Carlos ni Luis.
  const clientCount = db
    .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'client'")
    .get()

  if (clientCount?.n) {
    console.log(`Ya hay ${clientCount.n} clientes: no se siembran datos de demo.`)
  } else {
    await seedDemoData(db)
  }

  console.log('Seed completado.')
}

const isDirectRun = process.argv[1]?.includes('seed')
if (isDirectRun) {
  seed()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
}
