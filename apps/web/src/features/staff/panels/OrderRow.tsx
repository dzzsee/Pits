import { Link } from 'react-router-dom'
import { cx, stateColor } from '@/shared/colors'
import { formatDate, formatMoney, formatRelative } from '@/lib/format'
import { StateChip } from '@/components/ui'
import type { OrderSummary } from '@/lib/types'

/**
 * Fila de la lista de ordenes del taller. Es densa a proposito: el mecanico
 * recorre esta lista decenas de veces al dia y cada fila tiene que dar codigo,
 * vehiculo, estado e importe de un vistazo.
 */
export function OrderRow({ order }: { order: OrderSummary }) {
  const color = stateColor(order.state_color)

  return (
    <Link
      to={`/taller/orden/${order.id}`}
      className="card card-hover group flex items-center gap-4 py-4 pl-0 pr-5"
    >
      {/* Rail de estado: la referencia visual rapida al escanear la lista. */}
      <span className={cx('h-11 w-1 shrink-0', color.bar)} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-[11px] tracking-[0.06em] text-ink-muted">
            {order.code}
          </span>
          <span className="truncate text-sm font-medium">{order.vehicle_label}</span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-ink-muted/70">
          {formatDate(order.created_at)} · {formatRelative(order.state_changed_at)}
        </p>
      </div>

      <StateChip className={cx('hidden shrink-0 sm:inline-flex', color.chip)}>
        <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
        {order.state_label ?? 'Sin estado'}
      </StateChip>

      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
        {formatMoney(order.total_cents, order.currency)}
      </span>
    </Link>
  )
}