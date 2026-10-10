/**
 * Driver de Cloudflare D1.
 *
 * D1 expone un unico metodo (`batch`) que ejecuta statements preparados en una
 * sola transaccion y devuelve el resultado de cada uno. No tiene transacciones
 * interactivas: no hay `BEGIN`/`COMMIT` ni lectura dentro de una escritura en
 * curso, que es justo lo que necesita el motor de fidelizacion.
 *
 * Por eso `transaction()` ejecuta las escrituras de inmediato, en orden, en
 * lugar de acumularlas en un batch al final. Acumularlas daria atomicidad pero
 * las lecturas intermedias verian datos viejos, y `awardForRepair` consulta el
 * saldo justo despues de sumarle puntos: con el buffer leeria el saldo previo y
 * no cruzaria el umbral de recompensa. Se prefiere la ejecucion correcta a la
 * atomicidad aparente. El detalle queda anotado en el README del modulo.
 */
import { normalizeParams, type Database, type RunResult } from './database.js'

/** Subconjunto del binding D1 que usa el driver. */
export interface D1Binding {
  prepare(sql: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(sql: string): Promise<D1ExecResult>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1RunResult>
}

export interface D1Result<T> {
  results?: T[]
  success: boolean
  meta: Record<string, unknown>
}

export interface D1RunResult {
  success: boolean
  meta: { changes?: number; last_row_id?: number; rows_read?: number; rows_written?: number }
}

export interface D1ExecResult {
  count: number
  duration: number
}

/**
 * Partir un script SQL en sentencias.
 *
 * D1 no acepta multi-statement en `prepare`, asi que `pits.sql` y las
 * migraciones tienen que entrar uno por uno. El recorrido respeta cadenas y
 * comentarios: los `;` de un literal o de un trigger no pueden partir la
 * sentencia por la mitad.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: '"' | "'" | '`' | null = null
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }
    if (quote) {
      current += ch
      if (ch === quote) {
        // '' dentro de un literal escapa la comilla, no cierra la cadena.
        if (next === quote) {
          current += next
          i += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (ch === '-' && next === '-') {
      inLineComment = true
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      current += ch
      continue
    }
    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed) out.push(trimmed)
      current = ''
      continue
    }
    current += ch
  }

  const trimmed = current.trim()
  if (trimmed) out.push(trimmed)
  return out
}

export function openD1(env: D1Binding): Database {
  const db: Database = {
    driver: 'd1',

    async exec(sql: string) {
      const statements = splitStatements(sql)
      if (!statements.length) return
      await env.batch(statements.map((s) => env.prepare(s)))
    },

    prepare: ((sql: string) => {
      const bound = (params: unknown[]) => env.prepare(sql).bind(...normalizeParams(params))

      return {
        async get(...params: unknown[]) {
          const row = await bound(params).first()
          return (row ?? undefined) as never
        },
        async all(...params: unknown[]) {
          const res = await bound(params).all()
          return (res.results ?? []) as never[]
        },
        async run(...params: unknown[]): Promise<RunResult> {
          const res = await bound(params).run()
          return {
            changes: res.meta?.changes ?? 0,
            lastInsertRowid: res.meta?.last_row_id ?? 0,
          }
        },
      }
    }) as Database['prepare'],

    // Ver la nota de cabecera: se ejecuta en orden, sin atomicidad.
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return fn()
    },

    async close() {
      /* D1 no tiene conexiones que cerrar. */
    },
  }

  return db
}
