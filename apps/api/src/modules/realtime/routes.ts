/**
 * Canal de tiempo real: el servidor avisa que algo cambio y el web refresca
 * las consultas afectadas. Es el que hace que el cliente vea el estado de su
 * reparacion sin recargar la pagina.
 *
 * `EventSource` no permite cabeceras, asi que el token viaja por query string.
 * Por eso va por HTTPS en cualquier deploy real (localhost no lo exige).
 */
import { findById, verifyToken } from '../auth/service.js'
import { openStream } from '../../shared/events.js'
import { unauthorized, tooManyRequests } from '../../shared/errors.js'
import { guard, SCOPES } from '../../http/limits.js'
import { Router } from '../../http/router.js'

export const realtimeRouter = new Router()

realtimeRouter.get('/stream', async (c) => {
  // Cada conexion SSE se queda abierta mucho tiempo. Sin este tope, un atacante
  // abre cientos y agota los recursos del isolate que las sostiene.
  const limit = await guard(c, SCOPES.stream)
  if (limit) throw tooManyRequests('Demasiadas conexiones abiertas.', limit.retryAfterMs)

  const token = c.query.get('token') ?? ''

  let user: { id: number; role: string }
  try {
    // `verifyToken` comprueba firma, caducidad y tipo de token.
    const payload = await verifyToken(token, 'access')
    // El usuario se relee de la base, igual que hace el middleware
    // `authenticate`. Confiar en el `role` del JWT hacia que una cuenta
    // desactivada siguiera recibiendo el canal, y que un cambio de rol
    // tardara hasta que caducara el token en aplicarse aqui.
    const row = await findById(c.db, payload.sub, payload.ver, payload.sid)
    user = { id: row.id, role: row.role }
  } catch {
    throw unauthorized('Token invalido')
  }

  // En Workers el stream lo mantiene el Durable Object; en local, el bus en
  // memoria. Ambos exponen un `ReadableStream`.
  const connection = await openStream(user.id, user.role)

  return new Response(connection.stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Evita que un proxy intermedio acumule el stream.
      'X-Accel-Buffering': 'no',
      // El token viaja en la URL: sin esto queda en los logs del navegador.
      'Referrer-Policy': 'no-referrer',
    },
  })
})