/**
 * Contrato de acceso a datos.
 *
 * No importa nada de Node a proposito: tanto el driver de SQLite como el de
 * D1 dependen de aqui, y este modulo tiene que entrar en el bundle del Worker
 * sin arrastrar `node:fs` ni `node:sqlite`.
 *
 * La interfaz es asincrona porque D1 lo es y D1 es el destino de despliegue. El
 * driver de Node la cumple envolviendo las llamadas sincronas de
 * `better-sqlite3` / `node:sqlite` en promesas, de modo que el dominio no
 * distingue el runtime.
 */

export type SqlValue = string | number | bigint | boolean | Buffer | Uint8Array | null

export interface RunResult {
  changes: number | bigint
  lastInsertRowid: number | bigint
}

export interface BoundStatement<Row> {
  get(...params: unknown[]): Promise<Row | undefined>
  all(...params: unknown[]): Promise<Row[]>
  run(...params: unknown[]): Promise<RunResult>
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

export type Driver = 'better-sqlite3' | 'node:sqlite' | 'd1'

export interface Database {
  exec(sql: string): Promise<void>
  prepare: StatementFactory
  /**
   * Agrupa escrituras. SQLite lo resuelve con BEGIN/COMMIT; D1 ejecuta en
   * orden y sin atomicidad (ver `d1.ts`).
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>
  close(): Promise<void>
  driver: Driver
}

/** `undefined` no existe en SQLite: se traduce a NULL. Los booleanos, a 0/1. */
export function normalizeParams(params: unknown[]): SqlValue[] {
  return params.map((p) => {
    if (p === undefined) return null
    if (p === true) return 1
    if (p === false) return 0
    return p as SqlValue
  })
}
