import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDate, formatMoney, formatDateTime } from '@/lib/format'
import { stateColor, cx } from '@/shared/colors'
import { Badge, Card, SectionHeader, Skeleton } from '@/components/ui'
import { Timeline } from '@/components/Timeline'
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
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">No encontramos esa reparacion.</p>
        <Link to="/reparaciones" className="mt-3 inline-block text-sm font-medium underline underline-offset-4">
          Volver al historial
        </Link>
      </Card>
    )
  }

  const { order, vehicle, items, events, invoice } = data
  const color = stateColor(order.state_color)

  return (
    <div className="animate-fade-in">
      <Link
        to="/reparaciones"
        className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Reparaciones
      </Link>

      <Card className="relative overflow-hidden">
        <div className={cx('absolute inset-x-0 top-0 h-1', color.bar)} aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          <div>
            <p className="font-mono text-[12px] text-ink-subtle">{order.code}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{vehicle.plate}</h1>
            <p className="text-sm text-ink-muted">
              {vehicle.brand} {vehicle.model}
              {vehicle.year ? ` · ${vehicle.year}` : ''}
            </p>
          </div>
          <div className="text-right">
            <span
              className={cx(
                'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium',
                color.chip,
              )}
            >
              <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
              {order.state_label ?? 'Sin estado'}
            </span>
            <p className="mt-1.5 text-[12px] text-ink-subtle">
              {order.status === 'delivered'
                ? `Entregado el ${formatDate(order.delivered_at)}`
                : `Actualizado ${formatDateTime(order.state_changed_at)}`}
            </p>
          </div>
        </div>

        {order.client_note ? (
          <p className="mt-4 rounded-xl bg-surface-sunken px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">Tu solicitud: </span>
            {order.client_note}
          </p>
        ) : null}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionHeader title="Estado de la reparacion" />
          <Card>
            <Timeline events={events} />
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div>
            <SectionHeader title="Trabajos" />
            <Card className="p-0">
              {items.length ? (
                <ul className="divide-y divide-line">
                  {items
                    .filter((i) => i.status !== 'cancelled')
                    .map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[14px] leading-snug">{item.description}</p>
                          <p className="mt-0.5 text-[12px] text-ink-subtle">
                            {KIND_LABEL[item.kind] ?? item.kind}
                            {item.qty > 1 ? ` · x${item.qty}` : ''}
                          </p>
                        </div>
                        <p className="shrink-0 text-[14px] font-medium tabular-nums">
                          {formatMoney(Math.round(item.qty * item.unit_price_cents), order.currency)}
                        </p>
                      </li>
                    ))}
                  <li className="flex items-center justify-between px-4 py-3">
                    <p className="text-[14px] font-semibold">Total</p>
                    <p className="text-[15px] font-semibold tabular-nums">
                      {formatMoney(order.total_cents, order.currency)}
                    </p>
                  </li>
                </ul>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-ink-subtle">
                  El taller aun no detailo los trabajos.
                </p>
              )}
            </Card>

            {invoice ? (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-surface-raised px-4 py-3">
                <div>
                  <p className="font-mono text-[13px]">{invoice.number}</p>
                  <p className="text-[12px] text-ink-subtle">
                    Factura {invoice.status === 'paid' ? 'pagada' : 'emitida'}
                  </p>
                </div>
                <Badge tone={invoice.status === 'paid' ? 'success' : 'warning'}>
                  {invoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
                </Badge>
              </div>
            ) : null}
          </div>

          <div>
            <SectionHeader title="Vehiculo" />
            <Card>
              <dl className="space-y-3 text-sm">
                <Row label="Placa" value={vehicle.plate} />
                <Row label="Marca" value={`${vehicle.brand} ${vehicle.model}`} />
                {vehicle.year ? <Row label="Anio" value={String(vehicle.year)} /> : null}
                {order.mileage || vehicle.mileage ? (
                  <Row
                    label="Kilometraje"
                    value={`${(order.mileage ?? vehicle.mileage ?? 0).toLocaleString('es-DO')} km`}
                  />
                ) : null}
                {vehicle.vin ? <Row label="VIN" value={vehicle.vin} /> : null}
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
