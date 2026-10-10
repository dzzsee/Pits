import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatDate, formatMoney, formatRelative } from '@/lib/format'
import { stateColor, cx } from '@/shared/colors'
import { Card, ProgressBar, StateChip } from '@/components/ui'
import { IconArrowRight, IconChevronRight } from '@/components/icons'
import { Timeline } from '@/components/Timeline'
import type { LoyaltySummary, OrderDetail, OrderSummary } from '@/lib/types'
import { keys } from '@/lib/query-keys'

/**
 * Piezas de orden que usan el portal del cliente y el del taller.
 *
 * Vivian dentro de `DashboardPage` y las importaba `RepairsPage`: un componente
 * de biblioteca escondido en una pagina de ruta, que hacia que cambiar el
 * dashboard tocara el historial.
 */

/** Timeline de la orden en curso, con su propia consulta. */
export function ActiveTimeline({ orderId }: { orderId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: keys.repair(orderId),
    queryFn: () => api.get<OrderDetail>(`/repairs/${orderId}`),
  })

  if (isLoading) return <div className="h-32 w-full" />
  if (!data) return null

  return <Timeline events={data.events} compact />
}

/**
 * Panel de puntos del cliente. El saldo va en display sobre la barra, que es
 * de donde sale el impulso a canjear.
 */
export function LoyaltyCard({
  loyalty,
  currency,
}: {
  loyalty: LoyaltySummary
  currency: string
}) {
  const ready = loyalty.rewardsAvailable > 0

  return (
    <Card className="flex h-full flex-col">
      <p className="eyebrow">Puntos disponibles</p>

      <p className="stat-value mt-3 text-[clamp(3rem,6vw,4rem)] text-accent">{loyalty.points}</p>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-ink-muted">
          <span>
            {ready
              ? 'Recompensa lista'
              : `Faltan ${loyalty.remaining} pts`}
          </span>
          <span className="tabular-nums">{loyalty.percent}%</span>
        </div>
        <ProgressBar value={loyalty.percent} max={100} label="Progreso hacia la recompensa" />
      </div>

      <div className="mt-6 flex-1">
        {ready ? (
          <div className="rounded border border-ok/30 bg-ok/[0.06] p-3.5">
            <p className="text-[13px] font-medium text-ok">
              {loyalty.rewardsAvailable === 1
                ? 'Un lavado gratis listo'
                : `${loyalty.rewardsAvailable} lavados gratis listos`}
            </p>
            <p className="mt-1.5 font-mono text-sm font-semibold tracking-[0.12em] text-ok">
              {loyalty.codes[0]?.code}
            </p>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Ganas {loyalty.pointsPerRepair} puntos por cada reparacion. Con {loyalty.pointsPerReward}{' '}
            pts te damos un{' '}
            <strong className="font-medium text-ink">{loyalty.rewardLabel.toLowerCase()}</strong>.
          </p>
        )}
      </div>

      <Link
        to="/fidelizacion"
        className="mt-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted transition-colors hover:text-accent"
      >
        Ver detalle de puntos
        <IconChevronRight className="h-3.5 w-3.5" />
      </Link>

      <span className="sr-only">{currency}</span>
    </Card>
  )
}

/**
 * Tarjeta de orden en una lista. La barra de estado va en el borde superior:
 * en la orden activa y en la historica tiene que leerse igual.
 */
export function OrderCard({ order, currency }: { order: OrderSummary; currency: string }) {
  const color = stateColor(order.state_color)
  const delivered = order.status === 'delivered'

  return (
    <Link
      to={`/reparacion/${order.id}`}
      className="card card-hover relative block overflow-hidden p-5"
    >
      <span className={cx('absolute inset-x-0 top-0 h-[3px]', color.bar)} aria-hidden="true" />

      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.06em] text-ink-muted">{order.code}</p>
          <p className="mt-1 truncate text-[15px] font-medium">{order.vehicle_label}</p>
        </div>
        <StateChip className={delivered ? 'bg-ok/10 text-ok' : color.chip}>
          {delivered ? 'Entregado' : (order.state_label ?? 'En curso')}
        </StateChip>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px]">
        <span className="font-mono text-[11px] text-ink-muted">
          {formatDate(order.delivered_at ?? order.created_at)}
        </span>
        <span className="font-medium tabular-nums">{formatMoney(order.total_cents, currency)}</span>
      </div>
    </Link>
  )
}

/**
 * Panel destacado de la orden en curso. A diferencia de `OrderCard`, si lleva
 * su linea de tiempo: es la pantalla que el cliente mira cada pocos dias.
 */
export function ActiveRepairCard({ order, currency }: { order: OrderSummary; currency: string }) {
  const color = stateColor(order.state_color)

  return (
    <Card className="relative overflow-hidden">
      <span className={cx('absolute inset-x-0 top-0 h-[3px]', color.bar)} aria-hidden="true" />

      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.06em] text-ink-muted">{order.code}</p>
          <p className="mt-1 truncate font-display text-2xl uppercase leading-tight tracking-[0.01em]">
            {order.vehicle_label}
          </p>
        </div>
        <StateChip className={color.chip}>
          <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
          {order.state_label ?? 'Sin estado'}
        </StateChip>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-5 border-t border-line pt-5 sm:grid-cols-3">
        <div>
          <dt className="eyebrow">Recibido</dt>
          <dd className="mt-1.5 text-sm">{formatDate(order.created_at)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Ultimo cambio</dt>
          <dd className="mt-1.5 text-sm">{formatRelative(order.state_changed_at)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Total</dt>
          <dd className="mt-1.5 text-sm tabular-nums">
            {formatMoney(order.total_cents, currency)}
          </dd>
        </div>
      </dl>

      <Link
        to={`/reparacion/${order.id}`}
        className="mt-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-accent transition-colors hover:text-accent-hover"
      >
        Ver detalle y notas
        <IconArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Card>
  )
}