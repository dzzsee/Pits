/**
 * Genera `pits.sql` desde una base recien sembrada, en un archivo temporal.
 *
 *   npm run db:dump:fresh -w @pits/api
 *
 * Por que no volcar la base en uso: si el volcado sale de una base a medio
 * construir (una instancia recien arrancada, un seed interrumpido), esa
 * deficiencia queda congelada para toda maquina nueva que importe el archivo.
 * Aqui el volcado siempre nace de migraciones + datos de demo, sin depender de
 * lo que hubiera ahora mismo en `data/pits.db`, y sin tocar un servidor que
 * pueda estar corriendo.
 *
 * El volcado sale con las contrasenas ya en PBKDF2, que es el formato que usa
 * D1 en produccion.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDb, seedSqlPath } from '../src/db/connection.js'
import { dumpDatabase } from '../src/db/dump.js'
import { seed } from '../src/db/seed.js'

const temp = path.join(os.tmpdir(), `pits-dump-${process.pid}.db`)
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${temp}${suffix}`, { force: true })

const db = await createDb(temp)
await seed(db, { force: true })

const target = seedSqlPath()
const sql = await dumpDatabase(db)
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, sql, 'utf8')

const summary = (await db
  .prepare<[], { users: number; vehicles: number; orders: number; events: number; items: number }>(
    `SELECT (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM vehicles) AS vehicles,
              (SELECT COUNT(*) FROM repair_orders) AS orders,
              (SELECT COUNT(*) FROM state_events) AS events,
              (SELECT COUNT(*) FROM order_items) AS items`,
  )
  .get())!

console.log(`Volcado escrito en ${path.relative(process.cwd(), target)}`)
console.log(
  `  ${sql.split('\n').filter((l) => l.startsWith('INSERT INTO')).length} sentencias INSERT, ` +
    `${(sql.length / 1024).toFixed(1)} KB`,
)
console.log(
  `  ${summary.users} usuarios · ${summary.vehicles} vehiculos · ${summary.orders} ordenes · ` +
    `${summary.events} eventos · ${summary.items} trabajos`,
)

await db.close()
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${temp}${suffix}`, { force: true })
