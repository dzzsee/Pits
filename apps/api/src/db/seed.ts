import argon2 from 'argon2'
import { config } from '../config.js'
import { closeDb, getDb } from './connection.js'
import { DEFAULT_SETTINGS, setSetting, slugify } from './helpers.js'

const SUGGESTED_STATES = [
  { label: 'Recibido', color: 'slate', isTerminal: false },
  { label: 'Diagnóstico', color: 'sky', isTerminal: false },
  { label: 'En reparación', color: 'amber', isTerminal: false },
  { label: 'Control de calidad', color: 'violet', isTerminal: false },
  { label: 'Listo para entregar', color: 'emerald', isTerminal: false },
  { label: 'Entregado', color: 'emerald', isTerminal: true },
]

export async function seed(): Promise<void> {
  const db = getDb()

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

  if (!existingAdmin) {
    const hash = await argon2.hash(config.seed.adminPassword)
    db.prepare(
      `INSERT INTO users (role, email, name, password_hash)
       VALUES ('admin', ?, ?, ?)`,
    ).run(config.seed.adminEmail, 'Administrador Pits', hash)
    console.log(`Admin creado: ${config.seed.adminEmail} / ${config.seed.adminPassword}`)
  } else {
    console.log(`Admin ya existe: ${config.seed.adminEmail}`)
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
