import fs from 'node:fs'
import { config } from '../config.js'
import { migrate, type Db } from './connection.js'

/**
 * Primer arranque: si la base todavía no existe, se construye importando el
 * volcado `pits.sql` en vez de correr migraciones y el seed de demo.
 *
 * Así el repositorio guarda esquema y datos juntos, en texto y revisable. El
 * `.db` queda como el artefacto derivado que SQLite necesita para funcionar.
 *
 * Si el volcado no está (repo parcial, entorno de pruebas), se cae de vuelta a
 * migraciones + seed.
 */

export type BootstrapSource = 'dump' | 'migrations'

export function readSeedSql(): string | null {
  try {
    if (!fs.existsSync(config.seedSqlPath)) return null
    const sql = fs.readFileSync(config.seedSqlPath, 'utf8')
    // Un volcado vacío o corrupto no debe dejar la app sin tablas.
    if (!/CREATE TABLE/i.test(sql)) return null
    return sql
  } catch {
    return null
  }
}

export function bootstrap(db: Db, source: BootstrapSource): void {
  if (source === 'dump') {
    const sql = readSeedSql()
    if (sql) {
      db.exec(sql)
      return
    }
  }
  migrate(db)
}
