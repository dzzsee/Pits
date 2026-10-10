import { createDb, type Db } from '../src/db/connection.js'
import { DEFAULT_SETTINGS, setSetting, slugify } from '../src/db/helpers.js'
import { hashPassword } from '../src/lib/password.js'

export const ADMIN = { id: 1, email: 'admin@test.local', password: 'admin1234' }
export const MECHANIC = { id: 2, email: 'mec@test.local', password: 'demo1234' }
export const CLIENT = { id: 3, email: 'cli@test.local', password: 'demo1234' }

let counter = 0

export async function freshDb(): Promise<Db> {
  const db = await createDb(':memory:')
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) await setSetting(db, key, value)
  // Estados sugeridos minimos, como los que inserta el seed real.
  const insert = db.prepare(
    `INSERT INTO repair_states (key, label, color, position, is_suggested, is_custom, is_terminal)
     VALUES (?, ?, ?, ?, 1, 0, ?)`,
  )
  await insert.run(slugify('Recibido'), 'Recibido', 'slate', 0, 0)
  await insert.run(slugify('En reparación'), 'En reparación', 'amber', 1, 0)
  await insert.run(slugify('Entregado'), 'Entregado', 'emerald', 2, 1)
  return db
}

export async function seedUsers(db: Db): Promise<void> {
  const hash = await hashPassword('demo1234')
  await db
    .prepare(
      `INSERT INTO users (id, role, email, name, password_hash) VALUES (?, 'admin', ?, 'Admin', ?)`,
    )
    .run(ADMIN.id, ADMIN.email, hash)
  await db
    .prepare(
      `INSERT INTO users (id, role, email, name, password_hash) VALUES (?, 'mechanic', ?, 'Mecanico', ?)`,
    )
    .run(MECHANIC.id, MECHANIC.email, hash)
  await db
    .prepare(
      `INSERT INTO users (id, role, email, name, password_hash) VALUES (?, 'client', ?, 'Cliente', ?)`,
    )
    .run(CLIENT.id, CLIENT.email, hash)
  await db.prepare('INSERT INTO loyalty_accounts (client_id) VALUES (?)').run(CLIENT.id)
}

export async function seedVehicle(db: Db, clientId = CLIENT.id): Promise<number> {
  counter += 1
  const info = await db
    .prepare(
      `INSERT INTO vehicles (client_id, plate, brand, model, year, mileage) VALUES (?, ?, 'Toyota', 'Corolla', 2020, 10000)`,
    )
    .run(clientId, `TST-${counter}`)
  return Number(info.lastInsertRowid)
}

/** Cliente adicional, para probar que un carro ajeno no se puede usar. */
export async function seedOtherClient(db: Db): Promise<number> {
  counter += 1
  const info = await db
    .prepare(
      `INSERT INTO users (role, email, name, password_hash) VALUES ('client', ?, 'Otro', 'x')`,
    )
    .run(`otro-${counter}@test.local`)
  const id = Number(info.lastInsertRowid)
  await db.prepare('INSERT OR IGNORE INTO loyalty_accounts (client_id) VALUES (?)').run(id)
  return id
}
