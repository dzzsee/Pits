import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { openDatabase, type Database } from './driver.js'
import { bootstrap } from './bootstrap.js'
import { migrations } from './migrations.js'

export type Db = Database

let instance: Db | null = null
let sourceUsed: 'dump' | 'migrations' = 'migrations'

/** Como se construyó la base actual: desde el volcado o desde migraciones. */
export function getBootstrapSource(): 'dump' | 'migrations' {
  return sourceUsed
}

function open(file: string): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }
  const db = openDatabase(file)
  try {
    db.pragma('journal_mode = WAL')
  } catch {
    // node:sqlite no cambia journal mode en memoria; no es critico.
  }
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

export function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const applied = new Set(
    db
      .prepare<[], { id: number }>('SELECT id FROM _migrations')
      .all()
      .map((r) => r.id),
  )

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      db.exec(migration.up)
      db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name)
    })()
  }
}

export function getDb(): Db {
  if (!instance) {
    const file = config.databasePath
    const isFresh = file === ':memory:' || !fs.existsSync(file)
    instance = open(file)
    // Base nueva: se importa `pits.sql`. Base existente: solo migraciones, para
    // no pisar datos ya escritos.
    sourceUsed = isFresh ? 'dump' : 'migrations'
    bootstrap(instance, sourceUsed)
  }
  return instance
}

/** Crea una BD aislada (tests, scripts). No toca la instancia global. */
export function createDb(file = ':memory:'): Db {
  const db = open(file)
  migrate(db)
  return db
}

export function closeDb(): void {
  instance?.close()
  instance = null
}
