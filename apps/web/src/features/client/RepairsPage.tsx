import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Card, EmptyState, PageHeader, SearchInput, Skeleton } from '@/components/ui'
import { OrderCard } from '@/components/orders'
import { IconWrench } from '@/components/icons'
import { useState } from 'react'
import type { OrderSummary } from '@/lib/types'
import { keys } from '@/lib/query-keys'

interface OrdersResponse {
  items: OrderSummary[]
  total: number
}

export function RepairsPage() {
  const [q, setQ] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: keys.clientRepairs(),
    queryFn: () => api.get<OrdersResponse>('/me/repairs?limit=100'),
  })

  const all = data?.items ?? []

  // El filtro corre sobre lo ya cargado: son las ordenes del propio cliente,
  // nunca una consulta nueva al servidor.
  const needle = q.trim().toLowerCase()
  const items = needle
    ? all.filter((o) =>
        [o.code, o.vehicle_label, o.state_label ?? ''].some((v) =>
          v.toLowerCase().includes(needle),
        ),
      )
    : all

  const open = items.filter((o) => o.status === 'open')
  const done = items.filter((o) => o.status !== 'open')

  return (
    <div className="enter">
      <PageHeader
        eyebrow="Tu taller"
        title="Reparaciones"
        subtitle={data ? `${data.total} en total` : undefined}
      />

      {all.length > 0 ? (
        <div className="mb-8 max-w-sm">
          <SearchInput
            value={q}
            onValueChange={setQ}
            label="Buscar reparaciones"
            placeholder="Codigo, vehiculo o estado"
          />
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !items.length ? (
        <Card className="p-0">
          <EmptyState
            icon={<IconWrench className="h-14 w-14" />}
            title={all.length ? 'Sin resultados' : 'Sin reparaciones'}
            description={
              all.length
                ? 'Ninguna reparacion coincide con esa busqueda.'
                : 'Cuando traigas tu vehiculo, el taller abrira una orden aqui.'
            }
            action={
              all.length ? (
                <button type="button" className="btn btn-secondary btn-md" onClick={() => setQ('')}>
                  Limpiar busqueda
                </button>
              ) : (
                <Link to="/vehiculos" className="btn btn-secondary btn-md">
                  Registrar un vehiculo
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-10">
          {open.length ? (
            <section>
              <div className="rule mb-4">
                <span className="eyebrow">En curso</span>
                <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                  {open.length}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {open.map((o) => (
                  <OrderCard key={o.id} order={o} currency={o.currency} />
                ))}
              </div>
            </section>
          ) : null}

          {done.length ? (
            <section>
              <div className="rule mb-4">
                <span className="eyebrow">Historial</span>
                <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                  {done.length}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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