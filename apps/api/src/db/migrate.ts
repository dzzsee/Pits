import { closeDb, getDb } from './connection.js'

const db = getDb()
const rows = db.prepare('SELECT id, name, applied_at FROM _migrations ORDER BY id').all()
console.log(`Migraciones aplicadas: ${rows.length}`)
for (const r of rows as { id: number; name: string; applied_at: string }[]) {
  console.log(`  #${r.id} ${r.name} (${r.applied_at})`)
}
closeDb()
