import { Router } from 'express'
import { verifyToken } from '../auth/service.js'
import { subscribe, subscribeStaff } from '../../shared/events.js'
import { unauthorized } from '../../shared/errors.js'

const router = Router()

/**
 * Canal de tiempo real: el servidor avisa que algo cambio y el web refresca
 * las consultas afectadas. Es el que hace que el cliente vea el estado de su
 * reparacion sin recargar la pagina.
 *
 * `EventSource` no permite cabeceras, asi que el token viaja por query string.
 * Por eso va por HTTPS en cualquier deploy real (localhost no lo exige).
 */
router.get('/stream', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : ''

  let userId: number
  let role: string
  try {
    const payload = verifyToken(token, 'access')
    userId = payload.sub
    role = payload.role
  } catch {
    throw unauthorized('Token invalido')
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Evita que un proxy intermedio acumule el stream.
    'X-Accel-Buffering': 'no',
  })

  // Primeros bytes: confirman al cliente que la conexion esta viva.
  res.write('retry: 3000\n\n')

  const send = (payload: string) => {
    res.write(payload)
  }

  const unsubscribe =
    role === 'client' ? subscribe(userId, send) : subscribeStaff(userId, send)

  const close = () => {
    unsubscribe()
    res.end()
  }

  req.on('close', close)
  req.on('error', close)
})

export default router
