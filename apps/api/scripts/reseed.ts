/**
 * Resiembra la base desde cero con migraciones y datos de demo, y regenera
 * `pits.sql` a partir del resultado.
 *
 *   npm run db:reseed -w @pits/api
 *
 * Hace falta porque `pits.sql` es la fuente de verdad: si el volcado se
 * genera desde una base incompleta, esa deficiencia queda congelada en todas
 * las maquinas nuevas. Este script es el camino para rehacerlo bien.
 */
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config.js'
import { closeDb, getDb } from '../src/db/connection.js'
import { dumpDatabase } from '../src/db/dump.js'
import { seed } from '../src/db/seed.js'

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${config.databasePath}${suffix}`, { force: true })
}
console.log('Base anterior borrada; se reconstruye desde migraciones.')

// getDb() encuentra el archivo inexistente, pero importaria el volcado viejo.
// `force` lo esquiva: resiembra con datos de demo garantizados.
await seed({ force: true })

const db = getDb()
const sql = dumpDatabase(db)
fs.mkdirSync(path.dirname(config.seedSqlPath), { recursive: true })
fs.writeFileSync(config.seedSqlPath, sql, 'utf8')

const rows = db
  .prepare<[], { n: number }>(
    `SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM vehicles)
          + (SELECT COUNT(*) FROM repair_orders) + (SELECT COUNT(*) FROM state_events)
          + (SELECT COUNT(*) FROM order_items) + (SELECT COUNT(*) FROM notifications) AS n`,
  )
  .get()!.n

console.log(`Volcado regenerado en ${path.relative(process.cwd(), config.seedSqlPath)}`)
console.log(`  ${sql.split('\n').filter((l) => l.startsWith('INSERT INTO')).length} filas escritas`)
console.log(`  ${rows} filas de datos en la base`)

closeDb()
