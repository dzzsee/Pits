import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/layouts/ClientLayout'
import { Card, EmptyState, Skeleton } from '@/components/ui'
import { OrderCard } from './DashboardPage'
import type { OrderSummary } from '@/lib/types'
import { keys } from '@/lib/query-keys'
import { useSession } from '@/app/session'

interface OrdersResponse {
  items: OrderSummary[]
  total: number
}

export function RepairsPage() {
  const { user } = useSession()
  const { data, isLoading } = useQuery({
    queryKey: keys.clientRepairs(),
    queryFn: () => api.get<OrdersResponse>('/me/repairs?limit=100'),
  })

  const open = data?.items.filter((o) => o.status === 'open') ?? []
  const done = data?.items.filter((o) => o.status !== 'open') ?? []

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reparaciones"
        subtitle={user ? `${data?.total ?? 0} en total` : undefined}
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !data?.items.length ? (
        <Card className="p-0">
          <EmptyState
            title="Sin reparaciones"
            description="Cuando traigas tu vehiculo, el taller abrira una orden aqui."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {open.length ? (
            <section>
              <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-ink-subtle">
                En curso
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {open.map((o) => (
                  <OrderCard key={o.id} order={o} currency={o.currency} />
                ))}
              </div>
            </section>
          ) : null}

          {done.length ? (
            <section>
              <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-ink-subtle">
                Historial
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {done.map((o) => (
                  <OrderCard key={o.id} order={o} currency={o.currency} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
