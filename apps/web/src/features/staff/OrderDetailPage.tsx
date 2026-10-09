import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { cx, stateColor } from '@/shared/colors'
import { formatDate, formatRelative } from '@/lib/format'
import { Badge, Card, Select, Skeleton } from '@/components/ui'
import { Timeline } from '@/components/Timeline'
import { StateUpdatePanel, ItemsPanel, InvoicePanel } from './WorkshopPage'
import type { OrderDetail } from '@/lib/types'
import { invalidateOrder, keys } from '@/lib/query-keys'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: keys.repair(id),
    queryFn: () => api.get<OrderDetail>(`/repairs/${id}`),
    enabled: Boolean(id),
  })

  const mechanics = useQuery({
    queryKey: keys.mechanics(),
    queryFn: () => api.get<{ items: { id: number; name: string }[] }>('/staff/mechanics'),
  })

  const assign = useMutation({
    mutationFn: (mechanicId: number) =>
      api.patch(`/staff/repairs/${id}`, { mechanicId }),
    onSuccess: async () => {
      await invalidateOrder(queryClient, id)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-96 lg:col-span-3" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">No encontramos esa orden.</p>
        <Link to="/taller" className="mt-3 inline-block text-sm font-medium underline underline-offset-4">
          Volver a ordenes
        </Link>
      </Card>
    )
  }

  const { order, client, vehicle, mechanic, events, invoice } = data
  const color = stateColor(order.state_color)

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Ordenes
        </button>
        {invoice ? (
          <Badge tone={invoice.status === 'paid' ? 'success' : 'warning'}>
            Factura {invoice.number}
          </Badge>
        ) : null}
      </div>

      <Card className="relative overflow-hidden">
        <div className={cx('absolute inset-x-0 top-0 h-1', color.bar)} aria-hidden="true" />

        <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
          <div>
            <p className="font-mono text-[12px] text-ink-subtle">{order.code}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{vehicle.plate}</h1>
            <p className="text-sm text-ink-muted">
              {vehicle.brand} {vehicle.model}
              {vehicle.year ? ` · ${vehicle.year}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cx(
                'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium',
                color.chip,
              )}
            >
              <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
              {order.state_label ?? 'Sin estado'}
            </span>

            <div className="min-w-[10rem]">
              <Select
                value={mechanic?.id ?? ''}
                onChange={(e) => assign.mutate(Number(e.target.value))}
                aria-label="Mecanico asignado"
              >
                <option value="">Sin asignar</option>
                {mechanics.data?.items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <Info label="Cliente" value={client.name} />
          <Info label="Telefono" value={client.phone ?? '—'} />
          <Info label="Abierta" value={formatDate(order.created_at)} />
          <Info label="Ultimo cambio" value={formatRelative(order.state_changed_at)} />
        </dl>

        {order.client_note ? (
          <p className="mt-4 rounded-xl bg-surface-sunken px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">Cliente: </span>
            {order.client_note}
          </p>
        ) : null}
      </Card>

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold tracking-tight">Historial</h2>
              <span className="text-[12px] text-ink-subtle">{events.length} eventos</span>
            </div>
            <Timeline events={events} />
          </Card>

          <ItemsPanel order={data} />
        </div>

        <div className="space-y-5 lg:col-span-2">
          <StateUpdatePanel order={data} />
          <InvoicePanel order={data} />
          <Card>
            <h2 className="text-[15px] font-semibold tracking-tight">Cliente</h2>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              <Info label="Nombre" value={client.name} inline />
              <Info label="Correo" value={client.email} inline />
              <Info label="Telefono" value={client.phone ?? '—'} inline />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Info({
  label,
  value,
  inline,
}: {
  label: string
  value: string
  inline?: boolean
}) {
  if (inline) {
    return (
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-ink-subtle">{label}</dt>
        <dd className="truncate text-right font-medium">{value}</dd>
      </div>
    )
  }
  return (
    <div>
      <dt className="text-[12px] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  )
}