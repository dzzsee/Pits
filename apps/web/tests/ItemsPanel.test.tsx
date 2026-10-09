import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { describe, expect, it } from 'vitest'
import { ItemsPanel } from '@/features/staff/WorkshopPage'
import { api } from '@/lib/api'
import { keys } from '@/lib/query-keys'
import type { OrderDetail } from '@/lib/types'

/**
 * El caso que reporto el usuario: al agregar un trabajo al presupuesto, el
 * item no aparecia hasta recargar la pagina.
 *
 * Aqui se comprueba el efecto observable: tras la mutacion, la lista que esta
 * en pantalla muestra el item nuevo sin que nadie remonte el componente.
 */

const baseOrder: OrderDetail = {
  order: {
    id: 8,
    code: 'PITS-2026-0008',
    client_id: 3,
    vehicle_id: 1,
    mechanic_id: 2,
    state_id: 2,
    status: 'open',
    state_changed_at: '2026-03-10 15:30:00',
    state_label: 'En reparación',
    state_color: 'amber',
    state_key: 'en-reparacion',
    state_is_incident: 0,
    vehicle_label: 'ABC-123 - Toyota Corolla',
    client_note: null,
    mileage: 84200,
    subtotal_cents: 8500,
    discount_cents: 0,
    total_cents: 8500,
    currency: 'USD',
    created_at: '2026-03-10 12:00:00',
    delivered_at: null,
  },
  vehicle: {
    id: 1,
    client_id: 3,
    plate: 'ABC-123',
    vin: null,
    brand: 'Toyota',
    model: 'Corolla',
    year: 2020,
    mileage: 84200,
    notes: null,
  },
  client: { id: 3, name: 'Ana Rivera', email: 'ana@demo.local', phone: null },
  mechanic: { id: 2, name: 'Javier Santos' },
  items: [
    {
      id: 1,
      order_id: 8,
      kind: 'part',
      description: 'Pastillas delanteras',
      qty: 1,
      unit_price_cents: 8500,
      status: 'pending',
      applied_redemption_id: null,
    },
  ],
  events: [],
  invoice: null,
}

/**
 * Reproduce el flujo real de `OrderDetailPage`: la vista lee la orden del
 * cache y se la pasa a `ItemsPanel` por props. Por eso el item nuevo solo
 * aparece si la invalidacion de la mutacion alcanza a esa consulta.
 */
function Harness() {
  const { data } = useQuery({
    queryKey: keys.repair('8'),
    queryFn: () => api.get<OrderDetail>('/repairs/8'),
  })
  if (!data) return <p>cargando</p>
  return <ItemsPanel order={data} />
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  }
}

describe('ItemsPanel', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // El refetch que dispara la invalidacion devuelve el item agregado.
    const updated: OrderDetail = {
      ...baseOrder,
      items: [
        ...baseOrder.items,
        {
          id: 2,
          order_id: 8,
          kind: 'labor',
          description: 'Mano de obra - rectificado',
          qty: 1,
          unit_price_cents: 12000,
          status: 'pending',
          applied_redemption_id: null,
        },
      ],
      order: { ...baseOrder.order, total_cents: 20500 },
    }

    // Secuencia realista: la orden base, y despues del POST la que ya trae
    // el item agregado. Asi "aparecio sin recargar" significa algo real.
    let agregado = false

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/staff/repairs/8/items')) {
        agregado = true
        return jsonResponse({ id: 2 })
      }
      if (url.startsWith('/api/repairs/8')) {
        return jsonResponse(agregado ? updated : baseOrder)
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra el item agregado sin recargar la pagina', async () => {
    const user = userEvent.setup()
    renderPanel()

    await waitFor(() => expect(screen.getByText('Pastillas delanteras')).toBeInTheDocument())
    expect(screen.queryByText('Mano de obra - rectificado')).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Pastillas delanteras'), 'Mano de obra - rectificado')
    await user.type(screen.getByLabelText('Precio unitario'), '120')
    await user.click(screen.getByRole('button', { name: /agregar trabajo/i }))

    // La invalidacion se cumple sola: la lista se actualiza en el sitio.
    await waitFor(() => {
      expect(screen.getByText('Mano de obra - rectificado')).toBeInTheDocument()
    })

    // Y hubo un refetch de verdad: no se relio del cache viejo.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/repairs/8'),
      expect.anything(),
    )
  })

  it('el cache de la orden queda actualizado con el total nuevo', async () => {
    const user = userEvent.setup()
    const { client } = renderPanel()

    await waitFor(() => expect(screen.getByText('Pastillas delanteras')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Pastillas delanteras'), 'Filtro de aceite')
    await user.type(screen.getByLabelText('Precio unitario'), '25')
    await user.click(screen.getByRole('button', { name: /agregar trabajo/i }))

    await waitFor(() => {
      const cached = client.getQueryData(keys.repair(8)) as OrderDetail
      expect(cached.items).toHaveLength(2)
    })

    const cached = client.getQueryData(keys.repair(8)) as OrderDetail
    expect(cached.order.total_cents).toBe(20500)
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
