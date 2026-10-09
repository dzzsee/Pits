import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ZodError, ZodSchema } from 'zod'
import { HttpError } from './errors.js'

/** Envuelve handlers async para que los rechazos lleguen a errorHandler. */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

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

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code ?? 'error', message: err.message, details: err.details },
    })
    return
  }

  const e = err as { code?: string; message?: string }
  if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    res.status(409).json({
      error: { code: 'conflict', message: 'Ya existe un registro con esos datos' },
    })
    return
  }
  if (e?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    res.status(409).json({
      error: { code: 'conflict', message: 'Referencia inválida a otro registro' },
    })
    return
  }

  console.error('[pits] error no controlado:', err)
  res.status(500).json({
    error: { code: 'internal_error', message: 'Error interno del servidor' },
  })
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Ruta no encontrada' } })
}
