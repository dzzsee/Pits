import { verifyToken } from '../auth/service.js'
import { openStream } from '../../shared/events.js'
import { unauthorized } from '../../shared/errors.js'
import { Router } from '../../http/router.js'

export const realtimeRouter = new Router()

/**
 * Canal de tiempo real: el servidor avisa que algo cambio y el web refresca
 * las consultas afectadas. Es el que hace que el cliente vea el estado de su
 * reparacion sin recargar la pagina.
 *
 * `EventSource` no permite cabeceras, asi que el token viaja por query string.
 * Por eso va por HTTPS en cualquier deploy real (localhost no lo exige).
 */
realtimeRouter.get('/stream', async (c) => {
  const token = c.query.get('token') ?? ''

  let userId: number
  let role: string
  try {
    const payload = await verifyToken(token, 'access')
    userId = payload.sub
    role = payload.role
  } catch {
    throw unauthorized('Token invalido')
  }

  // En Workers el stream lo mantiene el Durable Object; en local, el bus en
  // memoria. Ambos exponen un `ReadableStream`.
  const connection = await openStream(userId, role)

  return new Response(connection.stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Evita que un proxy intermedio acumule el stream.
      'X-Accel-Buffering': 'no',
    },
  })
})
