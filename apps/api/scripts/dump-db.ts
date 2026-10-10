/**
 * Volca la base de datos a `pits.sql`.
 *
 *   npm run db:dump -w @pits/api
 *
 * Ese archivo es la fuente de verdad versionable: al arrancar en una maquina
 * limpia, la app lo importa en vez de correr migraciones (ver db/bootstrap.ts),
 * y es tambien lo que se sube a D1 en el despliegue.
 */
import fs from 'node:fs'
import path from 'node:path'
import { closeDb, databasePath, getDb, seedSqlPath } from '../src/db/connection.js'
import { dumpDatabase } from '../src/db/dump.js'

const target = seedSqlPath()

if (!fs.existsSync(databasePath())) {
  console.error(`No existe la base ${databasePath()}. Arranca el API una vez para crearla.`)
  process.exit(1)
}

const db = await getDb()
const sql = await dumpDatabase(db)

fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, sql, 'utf8')

const inserts = sql.split('\n').filter((l) => l.startsWith('INSERT INTO')).length
console.log(`Volcado escrito en ${path.relative(process.cwd(), target)}`)
console.log(`  ${inserts} filas, ${(sql.length / 1024).toFixed(1)} KB`)

await closeDb()
