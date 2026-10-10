import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { cx, stateColor } from '@/shared/colors'
import { formatDate, formatRelative } from '@/lib/format'
import {
  BackLink,
  Badge,
  Card,
  DataRow,
  Field,
  Select,
  Skeleton,
  StateChip,
} from '@/components/ui'
import { Timeline } from '@/components/Timeline'
import { IconAlert } from '@/components/icons'
import { StateUpdatePanel, ItemsPanel, InvoicePanel } from './WorkshopPage'
import type { OrderDetail } from '@/lib/types'
import { invalidateOrder, keys } from '@/lib/query-keys'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
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
    mutationFn: (mechanicId: number) => api.patch(`/staff/repairs/${id}`, { mechanicId }),
    onSuccess: async () => {
      await invalidateOrder(queryClient, id)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-44 w-full" />
        <div className="grid gap-8 lg:grid-cols-5">
          <Skeleton className="h-96 lg:col-span-3" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card className="p-0">
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <IconAlert className="mb-5 h-14 w-14 text-danger" />
          <p className="font-display text-xl uppercase tracking-[0.02em]">
            No encontramos esa orden
          </p>
          <p className="mt-2 max-w-sm text-sm text-ink-muted">
            Puede que se haya borrado, o que el enlace no sea el correcto.
          </p>
          <Link to="/taller" className="btn btn-secondary btn-md mt-6">
            Volver a ordenes
          </Link>
        </div>
      </Card>
    )
  }

  const { order, client, vehicle, mechanic, events, invoice } = data
  const color = stateColor(order.state_color)

  return (
    <div className="enter">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <BackLink to="/taller">Ordenes</BackLink>
        {invoice ? (
          <Badge tone={invoice.status === 'paid' ? 'success' : 'accent'}>
            Factura {invoice.number}
          </Badge>
        ) : null}
      </div>

      <Card className="relative overflow-hidden">
        <span className={cx('absolute inset-x-0 top-0 h-[3px]', color.bar)} aria-hidden="true" />

        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-[0.06em] text-ink-muted">{order.code}</p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.1em]">
              {vehicle.plate}
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">
              {vehicle.brand} {vehicle.model}
              {vehicle.year ? ` · ${vehicle.year}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StateChip className={color.chip}>
              <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
              {order.state_label ?? 'Sin estado'}
            </StateChip>

            <Field label="Mecanico" className="min-w-[11rem]">
              {(props) => (
                <Select
                  {...props}
                  value={mechanic?.id ?? ''}
                  onChange={(e) => assign.mutate(Number(e.target.value))}
                >
                  <option value="">Sin asignar</option>
                  {mechanics.data?.items.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-5 border-t border-line pt-5 sm:grid-cols-4">
          <div>
            <dt className="eyebrow">Cliente</dt>
            <dd className="mt-1.5 truncate text-sm">{client.name}</dd>
          </div>
          <div>
            <dt className="eyebrow">Telefono</dt>
            <dd className="mt-1.5 text-sm">{client.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="eyebrow">Abierta</dt>
            <dd className="mt-1.5 text-sm">{formatDate(order.created_at)}</dd>
          </div>
          <div>
            <dt className="eyebrow">Ultimo cambio</dt>
            <dd className="mt-1.5 text-sm">{formatRelative(order.state_changed_at)}</dd>
          </div>
        </dl>

        {order.client_note ? (
          <p className="mt-5 rounded border border-accent/30 bg-accent/[0.05] px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
            <span className="eyebrow mr-2">Dice el cliente</span>
            {order.client_note}
          </p>
        ) : null}
      </Card>

      <div className="mt-10 grid gap-8 lg:grid-cols-5">
        <div className="space-y-8 lg:col-span-3">
          <Card>
            <div className="rule mb-5">
              <span className="eyebrow">Historial</span>
              <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                {events.length}
              </span>
            </div>
            <Timeline events={events} />
          </Card>

          <ItemsPanel order={data} />
        </div>

        <div className="space-y-8 lg:col-span-2">
          <StateUpdatePanel order={data} />
          <InvoicePanel order={data} />

          <Card>
            <div className="rule mb-2">
              <span className="eyebrow">Cliente</span>
            </div>
            <dl className="divide-y divide-line">
              <DataRow label="Nombre" value={client.name} />
              <DataRow label="Correo" value={<span className="text-xs">{client.email}</span>} />
              <DataRow label="Telefono" value={client.phone ?? '—'} />
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}