/**
 * Volca la base de datos a `pits.sql`.
 *
 *   npm run db:dump -w @pits/api
 *
 * Ese archivo es la fuente de verdad versionable: al arrancar en una maquina
 * limpia, la app lo importa en vez de correr migraciones (ver db/bootstrap.ts).
 */
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config.js'
import { closeDb, getDb } from '../src/db/connection.js'
import { dumpDatabase } from '../src/db/dump.js'

const target = config.seedSqlPath

if (!fs.existsSync(config.databasePath)) {
  console.error(`No existe la base ${config.databasePath}. Arranca el API una vez para crearla.`)
  process.exit(1)
}

const db = getDb()
const sql = dumpDatabase(db)

fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, sql, 'utf8')

const inserts = sql.split('\n').filter((l) => l.startsWith('INSERT INTO')).length
console.log(`Volcado escrito en ${path.relative(process.cwd(), target)}`)
console.log(`  ${inserts} filas, ${(sql.length / 1024).toFixed(1)} KB`)

closeDb()
