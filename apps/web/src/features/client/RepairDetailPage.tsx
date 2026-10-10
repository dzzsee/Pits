import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDate, formatMoney, formatDateTime } from '@/lib/format'
import { stateColor, cx } from '@/shared/colors'
import { BackLink, Badge, Card, DataRow, Skeleton, StateChip } from '@/components/ui'
import { Timeline } from '@/components/Timeline'
import { IconAlert, IconInvoice } from '@/components/icons'
import type { OrderDetail } from '@/lib/types'
import { keys } from '@/lib/query-keys'

const KIND_LABEL: Record<string, string> = {
  part: 'Repuesto',
  labor: 'Mano de obra',
  service: 'Servicio',
}

export function RepairDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError } = useQuery({
    queryKey: keys.repair(id),
    queryFn: () => api.get<OrderDetail>(`/repairs/${id}`),
    enabled: Boolean(id),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card className="p-0">
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <IconAlert className="mb-5 h-14 w-14 text-danger" />
          <p className="font-display text-xl uppercase tracking-[0.02em]">
            No encontramos esa reparacion
          </p>
          <p className="mt-2 max-w-sm text-sm text-ink-muted">
            Puede que el taller todavia no la haya abierto, o que el enlace no sea el correcto.
          </p>
          <Link to="/reparaciones" className="btn btn-secondary btn-md mt-6">
            Volver al historial
          </Link>
        </div>
      </Card>
    )
  }

  const { order, vehicle, items, events, invoice } = data
  const color = stateColor(order.state_color)
  const billable = items.filter((i) => i.status !== 'cancelled')

  return (
    <div className="enter">
      <BackLink to="/reparaciones">Reparaciones</BackLink>

      <Card className="relative overflow-hidden">
        <span className={cx('absolute inset-x-0 top-0 h-[3px]', color.bar)} aria-hidden="true" />

        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-[0.06em] text-ink-muted">{order.code}</p>
            {/* La placa en mono: se lee como lo que es, un identificador. */}
            <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.1em]">
              {vehicle.plate}
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">
              {vehicle.brand} {vehicle.model}
              {vehicle.year ? ` · ${vehicle.year}` : ''}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StateChip className={color.chip}>
              <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
              {order.state_label ?? 'Sin estado'}
            </StateChip>
            <p className="font-mono text-[11px] text-ink-muted">
              {order.status === 'delivered'
                ? `Entregado el ${formatDate(order.delivered_at)}`
                : `Actualizado ${formatDateTime(order.state_changed_at)}`}
            </p>
          </div>
        </div>

        {order.client_note ? (
          <p className="mt-5 rounded border border-line bg-surface-hover px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
            <span className="eyebrow mr-2">Tu solicitud</span>
            {order.client_note}
          </p>
        ) : null}
      </Card>

      <div className="mt-10 grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="rule mb-4">
            <span className="eyebrow">Estado de la reparacion</span>
          </div>
          <Card>
            <Timeline events={events} />
          </Card>
        </div>

        <div className="space-y-8 lg:col-span-2">
          <div>
            <div className="rule mb-4">
              <span className="eyebrow">Trabajos</span>
              <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                {billable.length}
              </span>
            </div>
            <Card className="p-0">
              {billable.length ? (
                <ul className="divide-y divide-line">
                  {billable.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{item.description}</p>
                        <p className="eyebrow mt-1.5">
                          {KIND_LABEL[item.kind] ?? item.kind}
                          {item.qty > 1 ? ` · x${item.qty}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums">
                        {formatMoney(Math.round(item.qty * item.unit_price_cents), order.currency)}
                      </p>
                    </li>
                  ))}
                  <li className="flex items-center justify-between px-5 py-4">
                    <p className="eyebrow">Total</p>
                    <p className="font-display text-xl leading-none tabular-nums">
                      {formatMoney(order.total_cents, order.currency)}
                    </p>
                  </li>
                </ul>
              ) : (
                <p className="px-6 py-10 text-center text-sm text-ink-muted">
                  El taller aun no detallo los trabajos.
                </p>
              )}
            </Card>

            {invoice ? (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/[0.05] px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <IconInvoice className="h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-mono text-[13px] font-semibold tracking-[0.06em]">
                      {invoice.number}
                    </p>
                    <p className="eyebrow mt-1">
                      Factura {invoice.status === 'paid' ? 'pagada' : 'emitida'}
                    </p>
                  </div>
                </div>
                <Badge tone={invoice.status === 'paid' ? 'success' : 'accent'}>
                  {invoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
                </Badge>
              </div>
            ) : null}
          </div>

          <div>
            <div className="rule mb-4">
              <span className="eyebrow">Vehiculo</span>
            </div>
            <Card>
              <dl className="divide-y divide-line">
                <DataRow label="Placa" value={<span className="font-mono">{vehicle.plate}</span>} />
                <DataRow label="Marca" value={`${vehicle.brand} ${vehicle.model}`} />
                {vehicle.year ? <DataRow label="Anio" value={String(vehicle.year)} /> : null}
                {order.mileage || vehicle.mileage ? (
                  <DataRow
                    label="Kilometraje"
                    value={`${(order.mileage ?? vehicle.mileage ?? 0).toLocaleString('es-DO')} km`}
                  />
                ) : null}
                {vehicle.vin ? (
                  <DataRow label="VIN" value={<span className="font-mono text-xs">{vehicle.vin}</span>} />
                ) : null}
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}