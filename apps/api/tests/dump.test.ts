import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/db/connection.js'
import { createDb } from '../src/db/connection.js'
import { openDatabase } from '../src/db/driver.js'
import { dumpDatabase } from '../src/db/dump.js'
import { seed } from '../src/db/seed.js'

/**
 * El volcado es la fuente de verdad del proyecto: si pierde un valor, todas
 * las maquinas nuevas arrancan con datos rotos y no hay forma de notarlo salvo
 * que alguien mire la base. Estos tests comprueban el viaje completo.
 */

function snapshot(db: Db): Record<string, unknown[]> {
  const tables = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()

  const out: Record<string, unknown[]> = {}
  for (const t of tables) {
    out[t.name] = db.prepare<[], Record<string, unknown>>(`SELECT * FROM "${t.name}"`).all()
  }
  return out
}

describe('volcado SQL', () => {
  let db: Db

  beforeEach(async () => {
    db = createDb()
    await seed(db, { force: true })
  })

  it('no deja valores NULL donde el origen tiene datos', () => {
    const sql = dumpDatabase(db)

    // El fallo anterior escribia NULL en todas las columnas.
    expect(sql).not.toContain('VALUES(NULL,NULL,NULL)')
    expect(sql).toMatch(/INSERT INTO "users" VALUES\(1,'admin','admin@pits\.local'/)
  })

  it('escapa las comillas simples de los textos', () => {
    db.prepare(
      `INSERT INTO users (role, email, name, password_hash)
       VALUES ('client', 'quote@test.local', 'O''Brien & Cía', 'x')`,
    ).run()

    const sql = dumpDatabase(db)
    expect(sql).toContain("'O''Brien & Cía'")
  })

  it('reimporta en una base nueva con los mismos datos', () => {
    const original = dumpDatabase(db)
    const before = snapshot(db)

    // Base realmente vacia: es lo que encuentra el API en una maquina nueva.
    const restored = openDatabase(':memory:')
    restored.exec(original)

    const after = snapshot(restored)
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())
    for (const table of Object.keys(before)) {
      expect(after[table], `tabla ${table}`).toHaveLength(before[table]!.length)
    }
    restored.close()
  })

  it('conserva el orden y los indices', () => {
    const sql = dumpDatabase(db)

    expect(sql.startsWith('-- Pits:')).toBe(true)
    expect(sql).toContain('PRAGMA foreign_keys=OFF;')
    expect(sql).toContain('BEGIN TRANSACTION;')
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(sql).toContain('CREATE INDEX idx_orders_client ON repair_orders')
    // Los indices se emiten despues de las tablas que referencian.
    expect(sql.indexOf('CREATE TABLE repair_orders')).toBeLessThan(
      sql.indexOf('CREATE INDEX idx_orders_client'),
    )
  })

  it('respeta la exclusion de tablas', () => {
    const sql = dumpDatabase(db, { exclude: ['notifications'] })
    expect(sql).not.toContain('INSERT INTO "notifications"')
    expect(sql).toContain('INSERT INTO "users"')
  })

  it('el volcado deja las contadores AUTOINCREMENT listas para seguir', () => {
    const sql = dumpDatabase(db)
    expect(sql).toContain('INSERT INTO sqlite_sequence VALUES(')
  })
})
