/**
 * Exporta la base de datos a un volcado SQL portable.
 *
 *   npm run db:dump -w @pits/api
 *
 * El formato es el de `sqlite3 .dump`: `PRAGMA` + `BEGIN TRANSACTION`, el
 * contenido de `sqlite_master` en orden y, tras cada `CREATE TABLE`, sus
 * `INSERT`. Se puede revisar en un diff, versionar en git y reimportar.
 */

import type { Db } from './connection.js'

export interface DumpOptions {
  /** Tablas que se dejan fuera, por nombre. */
  exclude?: string[]
}

interface MasterRow {
  type: 'table' | 'index' | 'view' | 'trigger'
  name: string
  tbl_name: string
  sql: string | null
}

/** Tablas, vistas y triggers: su definicion va antes de sus datos. */
function hasDefinition(row: MasterRow): boolean {
  return row.type === 'table' || row.type === 'view' || row.type === 'trigger'
}

/** Escapa un valor al literal SQL que SQLite entiende al reimportar. */
function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString('hex').toUpperCase()}'`
  }
  // El unico delimitador de cadena en SQLite es la comilla simple.
  return `'${String(value).replace(/'/g, "''")}'`
}

export function dumpDatabase(db: Db, options: DumpOptions = {}): string {
  const exclude = new Set(options.exclude ?? [])

  const master = db
    .prepare<[], MasterRow>(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
       ORDER BY rowid`,
    )
    .all()
    .filter((row) => !exclude.has(row.name))

  const lines: string[] = [
    '-- Pits: volcado de la base de datos (esquema + datos).',
    '--',
    '-- Es la fuente de verdad del proyecto: al arrancar en una maquina limpia el',
    '-- API importa este archivo en lugar de correr migraciones.',
    '--',
    '-- Regenerar desde una base recien sembrada:',
    '--   npm run db:dump:fresh -w @pits/api',
    '-- Volcar la base que se esta usando tal cual:',
    '--   npm run db:dump -w @pits/api',
    '',
    'PRAGMA foreign_keys=OFF;',
    'BEGIN TRANSACTION;',
  ]

  for (const row of master) {
    if (!hasDefinition(row)) continue
    lines.push(`${row.sql};`)

    if (row.type !== 'table') continue

    const columns = tableColumns(db, row.name)
    if (!columns.length) continue

    const rows = db
      .prepare<[], Record<string, unknown>>(
        `SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${row.name}"`,
      )
      .all()

    for (const data of rows) {
      // El driver devuelve objetos por nombre de columna, no una tupla.
      const values = columns.map((c) => literal(data[c])).join(',')
      lines.push(`INSERT INTO "${row.name}" VALUES(${values});`)
    }
  }

  // Indices, vistas y triggers van despues: referencian tablas ya creadas.
  for (const row of master) {
    if (hasDefinition(row)) continue
    lines.push(`${row.sql};`)
  }

  const sequence = db.prepare<[], Record<string, unknown>>('SELECT * FROM sqlite_sequence').all()
  if (sequence.length) {
    for (const row of sequence) {
      lines.push(
        `INSERT INTO sqlite_sequence VALUES(${literal(row.name)},${literal(row.seq)});`,
      )
    }
  }

  lines.push('COMMIT;', '')
  return lines.join('\n')
}

/** Nombres de columna en el orden real de la tabla, sin comillas. */
function tableColumns(db: Db, table: string): string[] {
  const rows = db
    .prepare<[string], { name: string }>('SELECT name FROM pragma_table_info(?)')
    .all(table)
  return rows.map((r) => r.name)
}
