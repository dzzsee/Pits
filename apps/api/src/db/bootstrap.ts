import fs from 'node:fs'
import { migrate, seedSqlPath, type Db } from './connection.js'

/**
 * Primer arranque en local: si la base todavia no existe, se construye
 * importando el volcado `pits.sql` en vez de correr migraciones y el seed de
 * demo.
 *
 * Asi el repositorio guarda esquema y datos juntos, en texto y revisable. El
 * `.db` queda como el artefacto derivado que SQLite necesita para funcionar.
 *
 * En produccion esto no se usa: D1 se inicializa en el despliegue con
 * `wrangler d1 execute`, que importa el mismo volcado.
 *
 * Si el volcado no esta (repo parcial, entorno de pruebas), se cae de vuelta a
 * migraciones + seed.
 */

export type BootstrapSource = 'dump' | 'migrations'

export function readSeedSql(): string | null {
  try {
    const file = seedSqlPath()
    if (!fs.existsSync(file)) return null
    const sql = fs.readFileSync(file, 'utf8')
    // Un volcado vacio o corrupto no debe dejar la app sin tablas.
    if (!/CREATE TABLE/i.test(sql)) return null
    return sql
  } catch {
    return null
  }
}

export async function bootstrap(db: Db, source: BootstrapSource): Promise<void> {
  if (source === 'dump') {
    const sql = readSeedSql()
    if (sql) {
      await db.exec(sql)
      return
    }
  }
  await migrate(db)
}
