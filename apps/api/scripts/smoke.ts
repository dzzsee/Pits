/**
 * Prueba de humo contra un API corriendo (ver README).
 *
 * Ademas de recorrer el flujo de negocio, verifica el canal en vivo: se
 * suscribe al stream de un cliente y comprueba que el evento de un cambio de
 * estado llega por SSE antes de 1 segundo. Es el equivalente en terminal de lo
 * que hace `useRealtime` en el navegador.
 *
 *   npm run dev            # en otra terminal
 *   npm run smoke -w @pits/api
 */
import assert from 'node:assert/strict'

// Apunta al despliegue con SMOKE_BASE=https://tu-worker.workers.dev
const BASE =
  process.env.SMOKE_BASE ?? `http://localhost:${Number(process.env.SMOKE_PORT ?? 3111)}/api`

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

let failures = 0

function check(name, condition, extra) {
  const ok = Boolean(condition)
  if (!ok) failures += 1
  console.log(`${ok ? 'OK ' : 'ERR'} ${name}${extra ? ` ${JSON.stringify(extra)}` : ''}`)
  return ok
}

const login = await call('/auth/login', {
  method: 'POST',
  body: { email: 'mecanico@pits.local', password: 'demo1234' },
})
const mech = login.body?.accessToken
check('login mecanico', login.status === 200 && mech)

// Ana es la que llega con historial y un lavado disponible en el seed: cubre
// tambien el camino del canje.
const clientLogin = await call('/auth/login', {
  method: 'POST',
  body: { email: 'ana@demo.local', password: 'demo1234' },
})
const cli = clientLogin.body?.accessToken
check('login cliente', clientLogin.status === 200 && cli)

const dash = await call('/me/dashboard', { token: cli })
check('dashboard cliente', dash.status === 200, {
  abiertos: dash.body?.openRepairs?.length,
  historial: dash.body?.history?.length,
  puntos: dash.body?.loyalty?.points,
  lavados: dash.body?.loyalty?.rewardsAvailable,
})

const states = await call('/staff/repair-states', { token: mech })
check('estados', states.status === 200, { total: states.body?.items?.length })

const forbidden = await call('/staff/repairs', { token: cli })
check('cliente bloqueado en /staff', forbidden.status === 403, { status: forbidden.status })

/* --------------------- Canal en vivo (SSE) ------------------------- */

const events = []
let streamOk = false

// El cliente se suscribe como lo haria EventSource: token por query string.
// El AbortController es imprescindible: sin el, el stream nunca termina y el
// proceso se queda vivo colgado.
const streamAbort = new AbortController()

const streamPromise = (async () => {
  const res = await fetch(`${BASE}/stream?token=${encodeURIComponent(cli)}`, {
    signal: streamAbort.signal,
  })
  if (!res.ok || !res.body) {
    check('stream del cliente', false, { status: res.status })
    return
  }
  streamOk = true
  check('stream del cliente conectado', true)

  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '))
        if (line) events.push(JSON.parse(line.slice('data: '.length)))
      }
    }
  } catch {
    /* abortado al terminar la prueba: es lo esperado */
  }
})().catch(() => undefined)

const badStream = await call('/stream?token=invalido')
check('stream con token invalido rechazado', badStream.status === 401, {
  status: badStream.status,
})

/* --------------------------- Flujo de taller ------------------------ */

const vehicle = dash.body?.vehicles?.[0]
const order = await call('/staff/repairs', {
  method: 'POST',
  token: mech,
  body: { clientId: vehicle.client_id, vehicleId: vehicle.id },
})
check('crear orden', order.status === 201, { code: order.body?.order?.code })
const orderId = order.body.order.id

// El taller escribe un estado que el taller aun no usa.
const custom = await call(`/staff/repairs/${orderId}/transition`, {
  method: 'POST',
  token: mech,
  body: { state: 'Desmontando tren delantero', note: 'Amanece temprano', notifyClient: true },
})
check('estado personalizado', custom.status === 200, {
  estado: custom.body?.state?.label,
  color: custom.body?.state?.color,
})

// Da tiempo a que el stream registre la suscripcion antes de seguir.
await new Promise((r) => setTimeout(r, 250))

const incident = await call(`/staff/repairs/${orderId}/transition`, {
  method: 'POST',
  token: mech,
  body: { state: 'Esperando bujes del proveedor', isIncident: true, notifyClient: true },
})
check('estado con contratiempo', incident.status === 200)

const started = Date.now()
const eventSeen = await (async () => {
  for (let i = 0; i < 40; i++) {
    if (events.some((e) => e.type === 'order.updated' && e.orderId === orderId)) return true
    await new Promise((r) => setTimeout(r, 25))
  }
  return false
})()

check('el evento llego por SSE antes de 1s', eventSeen && Date.now() - started < 1000, {
  ms: Date.now() - started,
  recibidos: events.map((e) => e.type),
})

check(
  'el cliente recibio tambien una notificacion',
  events.some((e) => e.type === 'notification.new'),
  { recibidos: events.map((e) => e.type) },
)

await call(`/staff/repairs/${orderId}/items`, {
  method: 'POST',
  token: mech,
  body: { kind: 'part', description: 'Buje delantero', qty: 2, unitPriceCents: 6500 },
})
await call(`/staff/repairs/${orderId}/items`, {
  method: 'POST',
  token: mech,
  body: { kind: 'labor', description: 'Mano de obra', qty: 1, unitPriceCents: 9000 },
})

const delivered = await call(`/staff/repairs/${orderId}/transition`, {
  method: 'POST',
  token: mech,
  body: { state: 'Entregado', notifyClient: true },
})
check('entrega con puntos', delivered.status === 200, {
  puntos: delivered.body?.pointsAwarded,
  entregado: delivered.body?.delivered,
})

const invoice = await call(`/staff/repairs/${orderId}/invoice`, {
  method: 'POST',
  token: mech,
  body: { paymentMethod: 'efectivo', markPaid: true },
})
check('factura', invoice.status === 201, { numero: invoice.body?.number })

const detail = await call(`/repairs/${orderId}`, { token: cli })
check('el cliente ve el detalle', detail.status === 200, {
  eventos: detail.body?.events?.length,
  total: detail.body?.order?.total_cents,
})

const loyalty = await call('/me/loyalty', { token: cli })
check('fidelizacion', loyalty.status === 200, {
  puntos: loyalty.body?.points_balance,
  disponibles: loyalty.body?.redemptions?.filter((r) => r.status === 'available').length,
})

/* --------------------------- Reportes ------------------------------- */

const adminLogin = await call('/auth/login', {
  method: 'POST',
  body: { email: 'admin@pits.local', password: 'admin1234' },
})
const reports = await call('/admin/reports/summary', { token: adminLogin.body.accessToken })
check('reportes', reports.status === 200, {
  ingresos: reports.body?.revenue?.totalCents,
  entregadas: reports.body?.orders?.delivered,
})

const csv = await fetch(`${BASE}/admin/reports/export.csv`, {
  headers: { Authorization: `Bearer ${adminLogin.body.accessToken}` },
})
const csvText = await csv.text()
check('export CSV', csv.status === 200 && csvText.startsWith('Codigo,'), {
  filas: csvText.split('\n').length - 1,
})

/* ---------------------------- Canjes -------------------------------- */

const available = loyalty.body?.redemptions?.find((r) => r.status === 'available')
if (available) {
  const used = await call(`/staff/redemptions/${available.code}/redeem`, {
    method: 'POST',
    token: mech,
  })
  check('canje por el taller', used.status === 200, { codigo: available.code })
  const again = await call(`/staff/redemptions/${available.code}/redeem`, {
    method: 'POST',
    token: mech,
  })
  check('no se puede canjear dos veces', again.status >= 400, { status: again.status })
} else {
  console.log('--  sin codigos disponibles para probar el canje')
}

void streamPromise
streamAbort.abort()
assert.equal(streamOk || !cli, true)

console.log(failures === 0 ? '\nTodo OK' : `\n${failures} comprobaciones fallaron`)
process.exitCode = failures === 0 ? 0 : 1
// El stream ya esta abortado, pero undici puede tardar en soltar el socket.
process.exit(failures === 0 ? 0 : 1)
