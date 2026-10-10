/**
 * Barrido de salud: llama a todos los endpoints GET de lectura con los tres
 * roles y reporta cualquier 5xx. Existe porque varios listados construyen el
 * WHERE de forma opcional y un desajuste entre placeholders y argumentos
 * devuelve 500 en vez de datos.
 *
 *   npm run sweep -w @pits/api
 */
// Apunta al despliegue con SMOKE_BASE=https://tu-worker.workers.dev
const BASE =
  process.env.SMOKE_BASE ?? `http://localhost:${Number(process.env.SMOKE_PORT ?? 3001)}/api`

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return res.json()
}

async function hit(label, path, token) {
  try {
    const res = await fetch(BASE + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const status = res.status
    const bad = status >= 500
    console.log(`${bad ? 'ERR' : 'OK '} ${String(status).padEnd(3)} ${label.padEnd(34)} ${path}`)
    return !bad
  } catch (err) {
    console.log(`ERR ---  ${label.padEnd(34)} ${path}  ${(err as Error).message}`)
    return false
  }
}

const admin = await login('admin@pits.local', 'admin1234')
const mech = await login('mecanico@pits.local', 'demo1234')
const client = await login('ana@demo.local', 'demo1234')

let bad = 0

console.log('--- salud')
;(await hit('health', '/health')) || bad++

console.log('--- cliente')
for (const p of ['/me/dashboard', '/me/repairs', '/me/vehicles', '/me/loyalty', '/notifications']) {
  ;(await hit(`cliente ${p}`, p, client.accessToken)) || bad++
}

console.log('--- taller')
for (const p of [
  '/staff/repairs',
  '/staff/repairs?status=open',
  '/staff/repairs?q=abc',
  '/staff/repair-states',
  '/staff/repair-states?includeInactive=1',
  '/staff/clients',
  '/staff/clients?q=an',
  '/staff/mechanics',
  '/staff/redemptions',
  '/staff/redemptions?status=available',
  '/staff/redemptions?status=used',
]) {
  ;(await hit(`staff ${p}`, p, mech.accessToken)) || bad++
}

console.log('--- admin')
for (const p of [
  '/admin/users',
  '/admin/users?role=client',
  '/admin/users?role=mechanic',
  '/admin/users?role=admin',
  '/admin/loyalty-settings',
  '/admin/reports/summary',
  '/admin/reports/summary?from=2000-01-01&to=2100-01-01',
  '/admin/reports/export.csv',
]) {
  ;(await hit(`admin ${p}`, p, admin.accessToken)) || bad++
}

console.log('--- permisos (deben ser 4xx, no 5xx)')
for (const [label, path, token] of [
  ['cliente en /staff', '/staff/repairs', client.accessToken],
  ['mecanico en /admin', '/admin/users', mech.accessToken],
  ['cliente en /admin', '/admin/users', client.accessToken],
  ['sin token', '/me/dashboard', ''],
]) {
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const ok = res.status >= 400 && res.status < 500
  if (!ok) bad++
  console.log(`${ok ? 'OK ' : 'ERR'} ${String(res.status).padEnd(3)} ${label}`)
}

console.log(bad === 0 ? '\nSin 5xx' : `\n${bad} endpoints con 5xx`)
process.exit(bad === 0 ? 0 : 1)
