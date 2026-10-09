/**
 * Adaptador de SQLite.
 *
 * El proyecto declara `better-sqlite3` como dependencia principal, pero su
 * binding nativo requiere cadena de compilacion (VS Build Tools en Windows).
 * Cuando no esta disponible, caemos a `node:sqlite`, que viene integrado en
 * Node >= 22 y expone una API casi identica.
 *
 * Toda la app habla con esta interfaz, asi que el resto del codigo no sabe
 * cual de los dosDrivers esta activo.
 */
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)

export type SqlValue = string | number | bigint | Buffer | Uint8Array | null

export interface RunResult {
  changes: number | bigint
  lastInsertRowid: number | bigint
}

export interface Statement<Row = unknown> {
  get(...params: unknown[]): Row | undefined
  all(...params: unknown[]): Row[]
  run(...params: unknown[]): RunResult
}

export interface BoundStatement<Row> {
  get(...params: unknown[]): Row | undefined
  all(...params: unknown[]): Row[]
  run(...params: unknown[]): RunResult
}

/**
 * La firma de genericos imita la de better-sqlite3:
 * `db.prepare<Params, Row>(sql)` — los params solo existen por legibilidad.
 */
export interface StatementFactory {
  // El primer parametro de tipo (`Params`) existe para legibilidad y mirrors la
  // firma de better-sqlite3; no se usa en runtime.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  <Params extends unknown[] = unknown[], Row = unknown>(sql: string): BoundStatement<Row>
}

export interface Database {
  exec(sql: string): void
  prepare: StatementFactory
  /** better-sqlite3 expone `db.pragma()`; en node:sqlite no existe. */
  pragma(statement: string): void
  transaction<T>(fn: () => T): () => T
  close(): void
  driver: 'better-sqlite3' | 'node:sqlite'
}

/** node:sqlite rechaza `undefined`; SQLite lo trata como NULL. */
function normalize(params: unknown[]): SqlValue[] {
  return params.map((p) => {
    if (p === undefined) return null
    if (p === true) return 1
    if (p === false) return 0
    return p as SqlValue
  })
}

function bindParams(sql: string, params: unknown[]): SqlValue[] {
  // better-sqlite3 ignores an unused optional argument; node:sqlite does not.
  // Several list queries pass null when their optional WHERE clause is absent.
  return sql.includes('?') ? normalize(params) : []
}

interface BetterSqlite3Shape {
  new (filename: string, options?: unknown): {
    exec(sql: string): void
    prepare(sql: string): {
      get(...p: unknown[]): unknown
      all(...p: unknown[]): unknown[]
      run(...p: unknown[]): RunResult
    }
    pragma(statement: string): unknown
    transaction<T>(fn: () => T): () => T
    close(): void
  }
}

interface NodeSqliteShape {
  DatabaseSync: new (filename: string) => {
    exec(sql: string): void
    prepare(sql: string): {
      get(...p: unknown[]): unknown
      all(...p: unknown[]): unknown[]
      run(...p: unknown[]): RunResult
    }
    close(): void
  }
}

function tryBetterSqlite3(filename: string): Database | null {
  let Ctor: BetterSqlite3Shape
  try {
    Ctor = require_('better-sqlite3') as BetterSqlite3Shape
  } catch {
    return null
  }
  try {
    const raw = new Ctor(filename)
    raw.prepare('SELECT 1').get()
    return {
      driver: 'better-sqlite3',
      exec: (sql) => raw.exec(sql),
      prepare: ((sql: string) => {
        const st = raw.prepare(sql)
        return {
          get: (...p: unknown[]) => st.get(...p) as never,
          all: (...p: unknown[]) => st.all(...p) as never[],
          run: (...p: unknown[]) => st.run(...p),
        }
      }) as unknown as StatementFactory,
      pragma: (statement: string) => {
        raw.pragma(statement)
      },
      transaction: (fn) => raw.transaction(fn),
      close: () => raw.close(),
    }
  } catch {
    return null
  }
}

function nodeSqlite(filename: string): Database {
  const { DatabaseSync } = require_('node:sqlite') as NodeSqliteShape
  const raw = new DatabaseSync(filename)

  return {
    driver: 'node:sqlite',
    exec: (sql) => raw.exec(sql),
    prepare: ((sql: string) => {
      const st = raw.prepare(sql)
      return {
        get: (...p: unknown[]) => st.get(...bindParams(sql, p)) as never,
        all: (...p: unknown[]) => st.all(...bindParams(sql, p)) as never[],
        run: (...p: unknown[]) => st.run(...bindParams(sql, p)),
      }
    }) as unknown as StatementFactory,
    pragma: (statement: string) => {
      // node:sqlite acepta el mismo SQL de PRAGMA, sin metodo dedicado.
      const sql = statement.trim().toLowerCase()
      if (sql.startsWith('pragma ') || sql.startsWith('pragma;')) raw.exec(statement)
    },
    transaction: <T,>(fn: () => T) => {
      return () => {
        raw.exec('BEGIN')
        try {
          const out = fn()
          raw.exec('COMMIT')
          return out
        } catch (err) {
          try {
            raw.exec('ROLLBACK')
          } catch {
            /* la transaccion ya se abortó */
          }
          throw err
        }
      }
    },
    close: () => raw.close(),
  }
}

export function openDatabase(filename: string): Database {
  return tryBetterSqlite3(filename) ?? nodeSqlite(filename)
}

export function driverAvailable(): 'better-sqlite3' | 'node:sqlite' {
  return tryBetterSqlite3Available() ? 'better-sqlite3' : 'node:sqlite'
}

function tryBetterSqlite3Available(): boolean {
  try {
    const Ctor = require_('better-sqlite3') as BetterSqlite3Shape
    const raw = new Ctor(':memory:')
    raw.close()
    return true
  } catch {
    return false
  }
}
