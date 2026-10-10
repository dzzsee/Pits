/**
 * Base de datos en fichero, para desarrollo, scripts y tests.
 *
 * Todo este archivo es codigo de Node (`node:fs`). El Worker usa `d1.ts`
 * directamente, asi que nada de esto entra en su bundle.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './driver.js'
import type { Database } from './database.js'
import { bootstrap } from './bootstrap.js'
import { migrations } from './migrations.js'

export type Db = Database

let instance: Db | null = null
let sourceUsed: 'dump' | 'migrations' = 'migrations'

/** Como se construyó la base actual: desde el volcado o desde migraciones. */
export function getBootstrapSource(): 'dump' | 'migrations' {
  return sourceUsed
}

/**
 * Raiz del paquete (`apps/api`). Este archivo vive en `src/db`, asi que hacen
 * falta dos niveles; `SEED_SQL_PATH` se resuelve contra aqui y por eso apunta
 * a `../../pits.sql`.
 */
export function apiRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', '..')
}

/** Ruta del fichero SQLite de desarrollo. */
export function databasePath(): string {
  const configured = process.env.DATABASE_PATH ?? './data/pits.db'
  return path.isAbsolute(configured) ? configured : path.join(apiRoot(), configured)
}

/**
 * Volcado SQL versionado: esquema y datos en un archivo revisable, en lugar de
 * un binario que no se puede diffear.
 */
export function seedSqlPath(): string {
  const configured = process.env.SEED_SQL_PATH ?? '../../pits.sql'
  return path.isAbsolute(configured) ? configured : path.resolve(apiRoot(), configured)
}

async function open(file: string): Promise<Db> {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }
  const db = openDatabase(file)
  if (db.driver === 'better-sqlite3') {
    // WAL solo existe en el driver nativo; node:sqlite no lo expone.
    await db.exec('PRAGMA journal_mode = WAL').catch(() => undefined)
  }
  await db.exec('PRAGMA foreign_keys = ON').catch(() => undefined)
  return db
}

export async function migrate(db: Db): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const applied = new Set(
    (await db.prepare<[], { id: number }>('SELECT id FROM _migrations').all()).map((r) => r.id),
  )

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    await db.transaction(async () => {
      await db.exec(migration.up)
      await db
        .prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)')
        .run(migration.id, migration.name)
    })
  }
}

/**
 * Base de desarrollo en fichero. Es bloqueante por naturaleza (necesita disco),
 * asi que queda fuera del camino de Workers.
 */
export async function getDb(): Promise<Db> {
  if (instance) return instance

  const file = databasePath()
  const isFresh = file === ':memory:' || !fs.existsSync(file)

  const db = await open(file)
  // Base nueva: se importa `pits.sql`. Base existente: solo migraciones, para
  // no pisar datos ya escritos.
  sourceUsed = isFresh ? 'dump' : 'migrations'
  await bootstrap(db, sourceUsed)

  instance = db
  return db
}

/** Crea una BD aislada (tests, scripts). No toca la instancia global. */
export async function createDb(file = ':memory:'): Promise<Db> {
  const db = await open(file)
  await migrate(db)
  return db
}

export async function closeDb(): Promise<void> {
  await instance?.close()
  instance = null
}
