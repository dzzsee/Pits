import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDate, formatMoney, formatRelative } from '@/lib/format'
import { stateColor, cx } from '@/shared/colors'
import { Badge, Card, EmptyState, SectionHeader, Skeleton } from '@/components/ui'
import { PageHeader } from '@/layouts/ClientLayout'
import type { ClientDashboard, OrderDetail, OrderSummary } from '@/lib/types'
import { keys } from '@/lib/query-keys'
import { useSession } from '@/app/session'
import { Timeline } from '@/components/Timeline'

export function DashboardPage() {
  const { user } = useSession()
  const { data, isLoading } = useQuery({
    queryKey: keys.dashboard(),
    queryFn: () => api.get<ClientDashboard>('/me/dashboard'),
  })

  if (isLoading) return <DashboardSkeleton />

  if (!data) return null
  const active = data.openRepairs[0]
  const { loyalty, stats } = data

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`Hola, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle="Aqui esta el estado de tu vehiculo"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Estado actual */}
        <div className="lg:col-span-2">
          <SectionHeader title="Reparacion actual" />
          {active ? (
            <ActiveRepairCard order={active} events={[]} />
          ) : (
            <Card className="p-0">
              <EmptyState
                title="No tienes reparaciones en curso"
                description="Cuando traigas tu vehiculo al taller, aqui veras el estado en vivo."
              />
            </Card>
          )}
        </div>

        {/* Puntos */}
        <div>
          <SectionHeader title="Tus puntos" />
          <LoyaltyCard loyalty={loyalty} currency={data.shop.currency} />
        </div>
      </div>

      {/* Actividad reciente */}
      {active ? (
        <div className="mt-8">
          <SectionHeader title="Ultimos avances" />
          <Card>
            <ActiveTimeline orderId={active.id} />
          </Card>
        </div>
      ) : null}

      {/* Historial */}
      <div className="mt-8">
        <SectionHeader
          title="Reparaciones anteriores"
          action={
            data.history.length > 0 ? (
              <Link to="/reparaciones" className="text-[13px] font-medium text-ink-muted hover:text-ink">
                Ver todas
              </Link>
            ) : null
          }
        />
        {data.history.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.history.slice(0, 4).map((o) => (
              <OrderCard key={o.id} order={o} currency={data.shop.currency} />
            ))}
          </div>
        ) : (
          <Card className="p-0">
            <EmptyState title="Todavia sin historial" description="Aqui veras tus visitas pasadas." />
          </Card>
        )}
      </div>

      {/* Resumen */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        <StatCard label="Reparaciones" value={String(stats.completedRepairs)} />
        <StatCard label="Vehiculos" value={String(stats.vehicles)} />
        <StatCard
          label="Invertido"
          value={formatMoney(stats.spentCents, data.shop.currency)}
        />
      </div>
    </div>
  )
}

function ActiveRepairCard({ order }: { order: OrderSummary; events: unknown[] }) {
  const color = stateColor(order.state_color)
  const delivered = order.status === 'delivered'

  return (
    <Card className="relative overflow-hidden">
      <div className={cx('absolute inset-x-0 top-0 h-1', color.bar)} aria-hidden="true" />

      <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-ink-subtle">{order.code}</p>
          <p className="mt-0.5 truncate text-[17px] font-semibold tracking-tight">
            {order.vehicle_label}
          </p>
        </div>
        <span
          className={cx(
            'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium',
            color.chip,
          )}
        >
          <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
          {order.state_label ?? 'Sin estado'}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
        <div>
          <dt className="text-[12px] text-ink-subtle">Recibido</dt>
          <dd className="mt-0.5 text-sm">{formatDate(order.created_at)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-subtle">Ultimo cambio</dt>
          <dd className="mt-0.5 text-sm">{formatRelative(order.state_changed_at)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-subtle">Estado</dt>
          <dd className="mt-0.5 text-sm">{delivered ? 'Entregado' : 'En el taller'}</dd>
        </div>
      </dl>

      <Link
        to={`/reparacion/${order.id}`}
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"
      >
        Ver detalle y notas
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </Card>
  )
}

export function ActiveTimeline({ orderId }: { orderId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: keys.repair(orderId),
    queryFn: () => api.get<OrderDetail>(`/repairs/${orderId}`),
  })

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (!data) return null

  return <Timeline events={data.events} compact />
}

export function LoyaltyCard({
  loyalty,
  currency,
}: {
  loyalty: ClientDashboard['loyalty']
  currency: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <p className="text-[12px] uppercase tracking-wide text-ink-subtle">Puntos disponibles</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{loyalty.points}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[12px] text-ink-muted">
          <span>
            {loyalty.repairsUntilReward === 0
              ? 'Ya tienes un lavado listo'
              : `Faltan ${loyalty.remaining} pts`}
          </span>
          <span>{loyalty.percent}%</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={loyalty.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso hacia la recompensa"
        >
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-500"
            style={{ width: `${loyalty.percent}%` }}
          />
        </div>
      </div>

      {loyalty.rewardsAvailable > 0 ? (
        <div className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 dark:bg-emerald-950/50">
          <p className="text-[13px] font-medium text-emerald-800 dark:text-emerald-200">
            {loyalty.rewardsAvailable === 1 ? 'Lavado gratis' : `${loyalty.rewardsAvailable} lavados gratis`} disponible
          </p>
          <p className="mt-0.5 font-mono text-[12px] text-emerald-700 dark:text-emerald-300">
            {loyalty.codes[0]?.code}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
          Ganas {loyalty.pointsPerRepair} puntos por cada reparacion. Con{' '}
          {loyalty.pointsPerReward} pts te damos un <strong className="font-medium">{loyalty.rewardLabel.toLowerCase()}</strong>.
        </p>
      )}

      <Link
        to="/fidelizacion"
        className="mt-4 block text-[13px] font-medium text-ink-muted hover:text-ink"
      >
        Ver detalle de puntos
      </Link>
      <span className="sr-only">{currency}</span>
    </Card>
  )
}

export function OrderCard({ order, currency }: { order: OrderSummary; currency: string }) {
  const color = stateColor(order.state_color)
  return (
    <Link
      to={`/reparacion/${order.id}`}
      className="card block p-4 transition-shadow duration-150 hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-ink-subtle">{order.code}</p>
          <p className="mt-0.5 truncate text-[15px] font-medium">{order.vehicle_label}</p>
        </div>
        <Badge tone={order.status === 'delivered' ? 'success' : 'neutral'}>
          {order.status === 'delivered' ? 'Entregado' : (order.state_label ?? 'En curso')}
        </Badge>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[13px]">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
          {formatDate(order.delivered_at ?? order.created_at)}
        </span>
        <span className="font-medium tabular-nums">{formatMoney(order.total_cents, currency)}</span>
      </div>
    </Link>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] text-ink-subtle">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="animate-fade-in">
      <Skeleton className="h-8 w-48" />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-52 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}
