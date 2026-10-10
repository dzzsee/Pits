/**
 * Borra la base binaria para forzar el siguiente arranque a reconstruirla
 * desde `pits.sql`.
 *
 *   npm run db:reset -w @pits/api
 */
import fs from 'node:fs'
import { config } from '../src/config.js'

let removed = 0
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${config.databasePath}${suffix}`
  if (fs.existsSync(file)) {
    fs.rmSync(file)
    console.log(`borrado ${file}`)
    removed += 1
  }
}

if (removed === 0) {
  console.log('No habia base que borrar.')
}
console.log('El proximo arranque del API importara pits.sql.')
