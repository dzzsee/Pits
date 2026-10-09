export class HttpError extends Error {
  constructor(
    readonly status: number,
    override readonly message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, msg, 'bad_request', details)
export const unauthorized = (msg = 'No autenticado') => new HttpError(401, msg, 'unauthorized')
export const forbidden = (msg = 'Sin permisos') => new HttpError(403, msg, 'forbidden')
export const notFound = (msg = 'No encontrado') => new HttpError(404, msg, 'not_found')
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict')
