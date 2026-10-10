import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { Card, CounterBar, CounterDivider, EmptyState, PageHeader, Skeleton, StatCounter } from '@/components/ui'
import { ActiveRepairCard, ActiveTimeline, LoyaltyCard, OrderCard } from '@/components/orders'
import { IconWrench } from '@/components/icons'
import type { ClientDashboard } from '@/lib/types'
import { keys } from '@/lib/query-keys'
import { useSession } from '@/app/session'

export function DashboardPage() {
  const { user } = useSession()
  const { data, isLoading } = useQuery({
    queryKey: keys.dashboard(),
    queryFn: () => api.get<ClientDashboard>('/me/dashboard'),
  })

  if (isLoading) return <DashboardSkeleton />
  if (!data) return null

  const active = data.openRepairs[0]
  const { loyalty, stats, shop } = data
  const firstName = user?.name.split(' ')[0] ?? ''

  return (
    <div className="enter">
      <PageHeader
        eyebrow="Tu taller"
        title={firstName ? `Hola, ${firstName}` : 'Tu taller'}
        subtitle="Aqui esta el estado de tu vehiculo"
        action={
          <Link
            to="/reparaciones"
            className="btn btn-secondary btn-sm hidden sm:inline-flex"
          >
            Ver historial
          </Link>
        }
      />

      {active ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Estado actual + timeline. Ocupa dos columnas: es la pantalla. */}
          <div className="lg:col-span-2">
            <div className="rule mb-4">
              <span className="eyebrow">Reparacion actual</span>
              <span className="font-mono text-[11px] text-ink-muted">{active.code}</span>
            </div>

            <ActiveRepairCard order={active} currency={shop.currency} />

            <Card className="mt-6">
              <p className="eyebrow mb-5">Ultimos avances</p>
              <ActiveTimeline orderId={active.id} />
            </Card>
          </div>

          <div>
            <div className="rule mb-4">
              <span className="eyebrow">Tus puntos</span>
            </div>
            <LoyaltyCard loyalty={loyalty} currency={shop.currency} />
          </div>
        </div>
      ) : (
        <>
          <div className="rule mb-4">
            <span className="eyebrow">Reparacion actual</span>
          </div>
          <Card className="p-0">
            <EmptyState
              icon={<IconWrench className="h-14 w-14" />}
              title="Sin reparaciones en curso"
              description="Cuando traigas tu vehiculo al taller, aqui veras el estado en vivo."
              action={
                <Link to="/vehiculos" className="btn btn-secondary btn-md">
                  Registrar un vehiculo
                </Link>
              }
            />
          </Card>
        </>
      )}

      {/* Historial */}
      <div className="mt-12">
        <div className="rule mb-4">
          <span className="eyebrow">Reparaciones anteriores</span>
          {data.history.length > 0 ? (
            <Link
              to="/reparaciones"
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
            >
              Ver todas
            </Link>
          ) : null}
        </div>

        {data.history.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.history.slice(0, 4).map((o) => (
              <OrderCard key={o.id} order={o} currency={shop.currency} />
            ))}
          </div>
        ) : (
          <Card className="p-0">
            <EmptyState
              title="Todavia sin historial"
              description="Aqui veras tus visitas pasadas."
            />
          </Card>
        )}
      </div>

      {/* Resumen del cliente */}
      <div className="mt-12">
        <div className="rule mb-4">
          <span className="eyebrow">Tu resumen</span>
        </div>
        <CounterBar>
          <StatCounter value={stats.completedRepairs} label="Reparaciones" />
          <CounterDivider />
          <StatCounter value={stats.vehicles} label="Vehiculos" />
          <CounterDivider />
          <StatCounter value={formatMoney(stats.spentCents, shop.currency)} label="Invertido" />
        </CounterBar>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div>
      <Skeleton className="h-10 w-64" />
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  )
}