import { closeDb, getDb } from './connection.js'

const db = await getDb()
const rows = await db
  .prepare<[], { id: number; name: string; applied_at: string }>(
    'SELECT id, name, applied_at FROM _migrations ORDER BY id',
  )
  .all()

console.log(`Migraciones aplicadas: ${rows.length}`)
for (const r of rows) {
  console.log(`  #${r.id} ${r.name} (${r.applied_at})`)
}

await closeDb()
