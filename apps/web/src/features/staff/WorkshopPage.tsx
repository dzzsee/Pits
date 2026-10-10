import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useSession } from '@/app/session'
import { Card, EmptyState, PageHeader, SearchInput, SegmentedControl, Skeleton } from '@/components/ui'
import { IconList } from '@/components/icons'
import type { OrderSummary } from '@/lib/types'
import { keys } from '@/lib/query-keys'
import { OrderRow } from './panels/OrderRow'
import { StateUpdatePanel } from './panels/StateUpdatePanel'
import { ItemsPanel } from './panels/ItemsPanel'
import { InvoicePanel } from './panels/InvoicePanel'

/**
 * Los tres paneles viven ya en `panels/`. Se re-exportan desde aqui porque
 * `OrderDetailPage` y el test de `ItemsPanel` los importan por esta ruta.
 */
export { StateUpdatePanel, ItemsPanel, InvoicePanel }

interface OrdersResponse {
  items: OrderSummary[]
  total: number
}

type Filter = 'open' | '' | 'delivered' | 'cancelled'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'En curso' },
  { value: '', label: 'Todas' },
  { value: 'delivered', label: 'Entregadas' },
  { value: 'cancelled', label: 'Canceladas' },
]

export function WorkshopPage() {
  const { user } = useSession()
  const [status, setStatus] = useState<Filter>('open')
  const [q, setQ] = useState('')

  const query = useQuery({
    queryKey: keys.staffRepairs(status, q),
    queryFn: () =>
      api.get<OrdersResponse>(
        `/staff/repairs?limit=100${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  })

  const orders = query.data?.items ?? []
  const filtering = q.trim().length > 0 || status !== 'open'

  return (
    <div className="enter">
      <PageHeader
        eyebrow="Taller"
        title="Ordenes"
        subtitle={
          query.data
            ? `${query.data.total} en total${user?.role === 'mechanic' ? ' · las tuyas asignadas' : ''}`
            : 'Cargando...'
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SegmentedControl
          options={FILTERS}
          value={status}
          onChange={(next) => setStatus(next as Filter)}
        />
        <div className="min-w-[16rem] flex-1 sm:max-w-xs">
          <SearchInput
            value={q}
            onValueChange={setQ}
            label="Buscar ordenes"
            placeholder="Codigo, placa o cliente"
          />
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[4.25rem] w-full" />
          ))}
        </div>
      ) : !orders.length ? (
        <Card className="p-0">
          <EmptyState
            icon={<IconList className="h-14 w-14" />}
            title={filtering ? 'Sin resultados' : 'Sin ordenes'}
            description={
              filtering
                ? 'Ninguna orden coincide con este filtro.'
                : 'No hay ordenes abiertas en el taller.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  )
}