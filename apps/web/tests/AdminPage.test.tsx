import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, useSession } from '@/app/session'
import { AdminPage } from '@/features/admin/AdminPage'
import { tokenStore } from '@/lib/api'
import type { User } from '@/lib/types'

/**
 * El boton de desactivar cuentas no hacia nada visible. Dos motivos:
 *
 * 1. `GET /admin/users` devolvia usuarios sin `is_active`, asi que el panel no
 *    tenia forma de distinguir una cuenta desactivada de una activa.
 * 2. El fallo de la mutacion era silencioso: sin `onError` ni aviso en
 *    pantalla, un rechazo del API era indistinguible de un boton inerte.
 *
 * Aqui se cubre que el ciclo completo llega al API y se refleja en pantalla.
 */

const ana: User = {
  id: 4,
  role: 'client',
  email: 'ana@demo.local',
  phone: null,
  name: 'Ana Rivera',
  created_at: '2026-10-09 23:04:23',
  is_active: 1,
}

const inactiveAna: User = { ...ana, is_active: 0 }

const admin: User = {
  id: 1,
  role: 'admin',
  email: 'admin@pits.local',
  phone: null,
  name: 'Administrador Pits',
  created_at: '2026-01-01 00:00:00',
  is_active: 1,
}

let estadoServidor: User[] = [admin, ana]
let peticiones: string[] = []

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderAdmin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SessionProvider>
          <AdminPage />
        </SessionProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/**
 * El panel lee el usuario actual de la sesion para no ofrecer "desactivar"
 * sobre la propia cuenta. Se entra de verdad por el login en vez de escribir
 * en el almacen: `tokenStore` se resuelve al importar el modulo y en este
 * entorno cae a memoria, asi que escribirlo no llega a la sesion.
 */
async function renderAdminAutenticado() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
        }
      >
        <SessionProvider>
          <SessionGate />
        </SessionProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: /entrar/i }))
  return user
}

/** Puente minimo: monta la pagina, entra y la muestra ya autenticada. */
function SessionGate() {
  const { login, status } = useSession()
  const [, force] = useState(0)

  useEffect(() => {
    if (status === 'anonymous') {
      void login('admin@pits.local', 'admin1234').then(() => force((n) => n + 1))
    }
  }, [status, login])

  if (status !== 'authenticated') {
    return (
      <button type="button" onClick={() => void login('admin@pits.local', 'admin1234')}>
        Entrar
      </button>
    )
  }
  return <AdminPage />
}

describe('AdminPage · desactivar cuentas', () => {
  beforeEach(() => {
    estadoServidor = [admin, ana]
    peticiones = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const metodo = init?.method ?? 'GET'

        if (url.includes('/auth/me')) {
          return jsonResponse({ user: admin })
        }
        if (url.includes('/auth/login')) {
          return jsonResponse({
            user: admin,
            accessToken: 'access-de-prueba',
            refreshToken: 'refresh-de-prueba',
          })
        }
        if (url.includes('/admin/loyalty-settings')) {
          return jsonResponse({
            pointsPerRepair: 40,
            pointsPerReward: 400,
            rewardLabel: 'Lavado gratis',
            rewardValidDays: 90,
          })
        }
        if (url.includes('/admin/users/') && metodo === 'PATCH') {
          peticiones.push(`${metodo} ${url} ${String(init?.body)}`)
          const id = Number(url.match(/users\/(\d+)/)?.[1])
          const cuerpo = JSON.parse(String(init?.body)) as { isActive?: boolean }
          estadoServidor = estadoServidor.map((u) =>
            u.id === id ? { ...u, is_active: cuerpo.isActive ? 1 : 0 } : u,
          )
          return jsonResponse(estadoServidor.find((u) => u.id === id))
        }
        if (url.includes('/admin/users')) {
          return jsonResponse({ items: estadoServidor })
        }
        return jsonResponse({})
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStore.clear()
  })

  it('envia el PATCH con isActive false tras dos clics', async () => {
    const user = userEvent.setup()
    renderAdmin()

    const fila = await screen.findByText('Ana Rivera')
    expect(fila).toBeInTheDocument()

    // Primer clic: solo arma la confirmacion, no llama al API.
    await user.click(screen.getAllByRole('button', { name: /desactivar/i })[0]!)
    expect(peticiones).toHaveLength(0)

    // Segundo clic: confirma.
    await user.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() => expect(peticiones).toHaveLength(1))
    expect(peticiones[0]).toContain('isActive":false')

    // Y el panel refleja el cambio.
    await waitFor(() => expect(screen.getByText('Inactivo')).toBeInTheDocument())
  })

  it('ofrece Reactivar en una cuenta ya desactivada', async () => {
    estadoServidor = [admin, inactiveAna]
    renderAdmin()

    await screen.findByText('Ana Rivera')
    const reactivar = screen.getByRole('button', { name: /reactivar/i })

    const user = userEvent.setup()
    await user.click(reactivar)
    await waitFor(() => expect(peticiones).toHaveLength(1))
    expect(peticiones[0]).toContain('isActive":true')
  })

  it('avisa cuando el API rechaza el cambio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/auth/me')) return jsonResponse({ user: admin })
        if (url.includes('/admin/loyalty-settings')) {
          return jsonResponse({
            pointsPerRepair: 40,
            pointsPerReward: 400,
            rewardLabel: 'Lavado gratis',
            rewardValidDays: 90,
          })
        }
        if (url.includes('/admin/users/')) {
          return new Response(
            JSON.stringify({ error: { code: 'forbidden', message: 'Sin permisos' } }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('/admin/users')) return jsonResponse({ items: [admin, ana] })
        return jsonResponse({})
      }),
    )

    const user = userEvent.setup()
    renderAdmin()

    await screen.findByText('Ana Rivera')
    await user.click(screen.getAllByRole('button', { name: /desactivar/i })[0]!)
    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => expect(screen.getByText(/sin permisos/i)).toBeInTheDocument())
  })

  it('no deja desactivar la propia cuenta', async () => {
    await renderAdminAutenticado()

    await screen.findByText('Administrador Pits')
    expect(screen.getByText('Tu')).toBeInTheDocument()
    expect(screen.getByText(/no puedes desactivarte/i)).toBeInTheDocument()

    // Solo queda un boton de desactivar: el de la otra cuenta.
    expect(screen.getAllByRole('button', { name: /desactivar/i })).toHaveLength(1)
  })
})