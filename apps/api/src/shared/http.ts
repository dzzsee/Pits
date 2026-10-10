import type { ZodError, ZodSchema } from 'zod'
import { HttpError } from './errors.js'

/** Valida el cuerpo contra un esquema zod y devuelve los datos ya parseados. */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new HttpError(422, 'Datos inválidos', 'validation_error', flattenZod(result.error))
  }
  return result.data
}

function flattenZod(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

/**
 * Traduce cualquier error a la respuesta JSON que el web ya sabe consumir.
 * D1 reporta las violaciones de restricciones con codigos distintos a los de
 * SQLite local, asi que se reconocen las dos formas.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json(err.status, {
      error: { code: err.code ?? 'error', message: err.message, details: err.details },
    })
  }

  const message = err instanceof Error ? err.message : String(err)

  if (/UNIQUE constraint failed/i.test(message) || /SQLITE_CONSTRAINT_UNIQUE/.test(message)) {
    return json(409, {
      error: { code: 'conflict', message: 'Ya existe un registro con esos datos' },
    })
  }
  if (
    /FOREIGN KEY constraint failed/i.test(message) ||
    /SQLITE_CONSTRAINT_FOREIGNKEY/.test(message)
  ) {
    return json(409, {
      error: { code: 'conflict', message: 'Referencia inválida a otro registro' },
    })
  }

  console.error('[pits] error no controlado:', err)
  return json(500, { error: { code: 'internal_error', message: 'Error interno del servidor' } })
}

export function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
