/**
 * Prepara `pits.sql` para subirlo a D1.
 *
 *   npm run deploy:d1 -w @pits/api
 *
 * El volcado lo produce `sqlite3 .dump`, y tiene dos cosas que D1 no acepta:
 *
 * 1. El envoltorio `PRAGMA foreign_keys=OFF; BEGIN TRANSACTION; ... COMMIT;`.
 *    Cada `d1 execute` ya es atomico y las claves foraneas no se pueden
 *    desactivar desde SQL.
 * 2. El orden de los `INSERT`. El volcado inserta tabla por tabla en orden de
 *    creacion, que no respeta las claves foraneas: `order_items` y
 *    `ledger_entries` referencian `redemptions`, pero `redemptions` se inserta
 *    despues. En SQLite local lo tapa el `PRAGMA`; en D1, que las exige, la
 *    carga falla. Por eso aqui se calcula el orden de verdad a partir del
 *    grafo de referencias del propio esquema.
 *
 * Se escribe una copia en `.wrangler/d1-seed.sql`; el volcado del repositorio
 * no se toca, porque su envoltorio sigue siendo lo correcto para SQLite local.
 */
import fs from 'node:fs'
import path from 'node:path'
import { apiRoot, seedSqlPath } from '../src/db/connection.js'

/** Sentencias de control de transaccion que D1 rechaza. */
const REJECTED = [
  /^PRAGMA\s+foreign_keys/i,
  /^BEGIN\s+TRANSACTION/i,
  /^COMMIT/i,
  /^SAVEPOINT/i,
  /^RELEASE/i,
]

/** `sqlite_sequence` la mantiene el motor; insertarla a mano estorba. */
const MANAGED_TABLE = 'sqlite_sequence'

const source = seedSqlPath()
const out = path.resolve(apiRoot(), '../../.wrangler/d1-seed.sql')

/** Agrupa las lineas en sentencias completas, terminadas en `;`. */
function toStatements(text: string): string[] {
  const out: string[] = []
  let buffer: string[] = []

  for (const line of text.split('\n')) {
    if (REJECTED.some((re) => re.test(line.trim()))) continue
    if (!line.trim() && buffer.length === 0) continue

    buffer.push(line)
    if (line.trimEnd().endsWith(';')) {
      const statement = buffer.join('\n').trim()
      if (statement) out.push(statement)
      buffer = []
    }
  }
  return out
}

const statements = toStatements(fs.readFileSync(source, 'utf8'))

/* ------------------------ Claves foraneas del esquema ------------------- */

const CREATE_TABLE = /^CREATE TABLE\s+(\w+)\s*\(([\s\S]*)\)\s*;?$/
const REFERENCES = /REFERENCES\s+(\w+)\s*\(/gi

/** Tabla -> tablas de las que depende. */
const dependsOn = new Map<string, Set<string>>()

for (const statement of statements) {
  const table = CREATE_TABLE.exec(statement)
  if (!table) continue

  const deps = new Set<string>()
  for (const match of (table[2] ?? '').matchAll(REFERENCES)) {
    if (match[1]) deps.add(match[1])
  }
  dependsOn.set(table[1]!, deps)
}

/**
 * Ordena las tablas de forma que ninguna se inserte antes de lo que referencia.
 * Kahn con orden alfabetico entre las que estan libres, para que el resultado
 * sea estable entre ejecuciones.
 */
function sortByDependencies<T>(items: T[], name: (item: T) => string): T[] {
  const remaining = new Map(dependsOn)
  const done = new Set<string>()
  const sorted: T[] = []

  const pending = [...items]
  while (pending.length > 0) {
    const index = pending.findIndex((item) => {
      const deps = remaining.get(name(item)) ?? new Set<string>()
      return [...deps].every((d) => done.has(d) || !items.some((i) => name(i) === d))
    })

    // Un ciclo de referencias haria que no haya candidato; en ese caso se
    // deja el orden original para no perder datos.
    if (index === -1) return [...sorted, ...pending]

    const [item] = pending.splice(index, 1)
    const key = name(item!)
    done.add(key)
    remaining.delete(key)
    sorted.push(item!)
  }

  return sorted
}

/* ------------------------------ Ensamblado ------------------------------- */

const schema: string[] = []
const dataByTable = new Map<string, string[]>()

for (const statement of statements) {
  if (/^\s*(CREATE|INSERT)/i.test(statement)) {
    if (/^CREATE/i.test(statement)) {
      schema.push(statement)
      continue
    }
    const table = /^INSERT INTO\s+"?(\w+)"?/i.exec(statement)?.[1]
    if (!table || table === MANAGED_TABLE) continue
    const list = dataByTable.get(table) ?? []
    list.push(statement)
    dataByTable.set(table, list)
  } else {
    // Indices, vistas y triggers: van despues de las tablas, como en el volcado.
    schema.push(statement)
  }
}

const tables = [...dataByTable.keys()]
const ordered = sortByDependencies(tables, (t) => t)

const body = [
  '-- Generado por apps/api/scripts/d1-seed.ts a partir de pits.sql.',
  '-- No editar a mano: se regenera en cada `npm run deploy:d1`.',
  '',
  ...schema,
  '',
  '-- Datos, en orden que respeta las claves foraneas.',
  ...ordered.flatMap((table) => dataByTable.get(table) ?? []),
].join('\n')

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${body}\n`, 'utf8')

const counts = ordered.map((t) => `${t}=${dataByTable.get(t)!.length}`)
console.log(`Volcado saneado para D1: ${path.relative(process.cwd(), out)}`)
console.log(`  ${schema.length} sentencias de esquema, ${counts.length} tablas con datos`)
console.log(`  orden de carga: ${ordered.join(' -> ')}`)
console.log(`  filas por tabla: ${counts.join(' ')}`)
