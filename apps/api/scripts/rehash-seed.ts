/**
 * Re-hashea los usuarios de `pits.sql` con el algoritmo vigente.
 *
 *   npm run db:rehash -w @pits/api
 *
 * Hace falta porque `argon2` es un binario nativo que no existe en Workers: al
 * desplegar en D1 hay que guardar los hashes en PBKDF2. Los usuarios de demo
 * son conocidos (ver `src/db/seed.ts` y `src/db/seed-demo.ts`), asi que se
 * regeneran sus contrasenas en lugar de dejar cuentas que nadie puede entrar.
 *
 * Es idempotente: si el hash ya esta en PBKDF2 lo deja como esta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword, verifyPassword } from '../src/lib/password.js'

/** Contrasenas conocidas del seed, por correo. */
const PASSWORDS: Record<string, string> = {
  'admin@pits.local': 'admin1234',
  'mecanico@pits.local': 'demo1234',
  'mecanico2@pits.local': 'demo1234',
  'ana@demo.local': 'demo1234',
  'carlos@demo.local': 'demo1234',
  'luis@demo.local': 'demo1234',
}

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dump = path.resolve(apiRoot, process.env.SEED_SQL_PATH ?? '../../pits.sql')

const original = fs.readFileSync(dump, 'utf8')
const lines = original.split('\n')
let changed = 0
let skipped = 0

const next: string[] = []

for (const line of lines) {
  const match = /^INSERT INTO "users" VALUES\(/.exec(line)
  if (!match) {
    next.push(line)
    continue
  }

  // Campos: id, role, email, phone, name, password_hash, is_active, fechas.
  const email = /^INSERT INTO "users" VALUES\(\s*\d+\s*,\s*'[^']*'\s*,\s*'([^']+)'/.exec(line)
  if (!email) {
    next.push(line)
    continue
  }

  const password = PASSWORDS[email[1]!]
  if (!password) {
    // Usuario que no viene del seed (p.ej. alguien creado a mano): avisar en
    // vez de inventarle una contrasena.
    console.warn(`  ! ${email[1]} no esta en el seed: su hash se deja como esta`)
    skipped += 1
    next.push(line)
    continue
  }

  const hashed = await hashPassword(password)
  if (!(await verifyPassword(hashed, password))) {
    throw new Error('El hash generado no verifica contra su propia contrasena')
  }

  // Sustituye el campo password_hash, que es el unico que empieza por `$`.
  next.push(line.replace(/'\$[^']*'/, `'${hashed}'`))
  changed += 1
}

if (changed === 0) {
  console.log('No habia hashes de argon2: el volcado ya esta re-hasheado.')
} else {
  fs.writeFileSync(dump, next.join('\n'), 'utf8')
  console.log(`${changed} usuario(s) re-hasheados a PBKDF2 en ${dump}`)
}

if (skipped > 0) console.log(`${skipped} usuario(s) quedaron sin tocar`)
