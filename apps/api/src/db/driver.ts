/**
 * Drivers de SQLite en fichero, para desarrollo, scripts y tests.
 *
 * El proyecto declara `better-sqlite3` como dependencia opcional, pero su
 * binding nativo exige cadena de compilacion (VS Build Tools en Windows).
 * Cuando no esta disponible caemos a `node:sqlite`, integrado en Node >= 22 y
 * con una API casi identica.
 *
 * Todo este archivo es codigo de Node: el Worker nunca lo carga.
 */
import { createRequire } from 'node:module'
import { normalizeParams, type Database, type RunResult, type SqlValue } from './database.js'

const require_ = createRequire(import.meta.url)

function bindParams(sql: string, params: unknown[]): SqlValue[] {
  // better-sqlite3 ignora un argumento opcional de mas; node:sqlite no.
  // Varias consultas de listado pasan null cuando su WHERE opcional no aplica.
  return sql.includes('?') ? normalizeParams(params) : []
}

interface RawDatabase {
  exec(sql: string): void
  prepare(sql: string): {
    get(...p: unknown[]): unknown
    all(...p: unknown[]): unknown[]
    run(...p: unknown[]): RunResult
  }
  close(): void
}

interface BetterSqlite3Shape {
  new (
    filename: string,
    options?: unknown,
  ): RawDatabase & {
    pragma(statement: string): unknown
  }
}

interface NodeSqliteShape {
  DatabaseSync: new (filename: string) => RawDatabase
}

/** Envuelve un driver sincrono cualquiera en la interfaz asincrona. */
function wrap(
  driver: Database['driver'],
  raw: RawDatabase,
  pragma?: (sql: string) => void,
): Database {
  const db: Database = {
    driver,
    exec: async (sql) => {
      raw.exec(sql)
    },
    prepare: ((sql: string) => {
      const st = raw.prepare(sql)
      return {
        get: async (...p: unknown[]) => st.get(...bindParams(sql, p)) as never,
        all: async (...p: unknown[]) => st.all(...bindParams(sql, p)) as never[],
        run: async (...p: unknown[]) => st.run(...bindParams(sql, p)),
      }
    }) as unknown as Database['prepare'],
    transaction: async <T>(fn: () => Promise<T>) => {
      raw.exec('BEGIN')
      try {
        const out = await fn()
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
    },
    close: async () => raw.close(),
  }

  // `pragma` solo existe en better-sqlite3; se adjunta sin ensuciar la interfaz.
  if (pragma) Object.assign(db, { pragma })
  return db
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
    return wrap('better-sqlite3', raw, (sql) => {
      raw.pragma(sql)
    })
  } catch {
    return null
  }
}

function nodeSqlite(filename: string): Database {
  const { DatabaseSync } = require_('node:sqlite') as NodeSqliteShape
  return wrap('node:sqlite', new DatabaseSync(filename))
}

/** Abre un fichero SQLite. Se usa en desarrollo, scripts y tests. */
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

export type { BoundStatement, Database, RunResult } from './database.js'
