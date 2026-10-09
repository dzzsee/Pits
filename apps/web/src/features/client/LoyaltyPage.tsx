import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatDate, formatRelative } from '@/lib/format'
import { Alert, Badge, Button, Card, EmptyState, SectionHeader, Skeleton } from '@/components/ui'
import { PageHeader } from '@/layouts/ClientLayout'
import type { LoyaltyDetail } from '@/lib/types'
import { keys } from '@/lib/query-keys'

const REASON: Record<string, string> = {
  repair: 'Reparacion entregada',
  reward_granted: 'Recompensa otorgada',
  redeem: 'Recompensa canjeada',
  adjust: 'Ajuste',
}

export function LoyaltyPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: keys.loyalty(),
    queryFn: () => api.get<LoyaltyDetail>('/me/loyalty'),
  })

  const redeem = useMutation({
    mutationFn: (id: number) => api.post(`/me/loyalty/redeem/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.loyalty() })
      await queryClient.invalidateQueries({ queryKey: keys.dashboard() })
      await queryClient.invalidateQueries({ queryKey: keys.redemptions() })
    },
  })

  const [error, setError] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data) return null

  const available = data.redemptions.filter((r) => r.status === 'available')
  const history = data.redemptions.filter((r) => r.status !== 'available')

  return (
    <div className="animate-fade-in">
      <PageHeader title="Fidelizacion" subtitle={`${data.lifetime_points} puntos acumulados`} />

      {/* Resumen */}
      <Card className="overflow-hidden">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-ink-subtle">Disponibles</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {data.points_balance}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-subtle">puntos</p>
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-wide text-ink-subtle">Cada reparacion</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              +{data.pointsPerRepair}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-subtle">puntos al entregar</p>
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-wide text-ink-subtle">Lavados</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {data.rewards_redeemed}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-subtle">canjeados</p>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-ink-muted">
              {data.repairsUntilReward === 0
                ? 'Ya tienes un lavado listo para usar'
                : `Te faltan ${data.remaining} puntos`}
            </span>
            <span className="font-medium tabular-nums">
              {data.points_balance} / {data.pointsPerReward}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={data.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso hacia el lavado gratis"
          >
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-500"
              style={{ width: `${data.percent}%` }}
            />
          </div>
          <p className="mt-3 text-[13px] text-ink-muted">
            {data.repairsUntilReward === 0
              ? 'Muestra tu codigo en recepcion la proxima vez que vengas.'
              : `A ${data.repairsUntilReward} ${data.repairsUntilReward === 1 ? 'reparacion' : 'reparaciones'} mas te ganamos un ${data.rewardLabel.toLowerCase()}.`}
          </p>
        </div>
      </Card>

      {/* Codigos disponibles */}
      <div className="mt-8">
        <SectionHeader title="Tus recompensas" />
        {error ? (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        {available.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {available.map((r) => (
              <Card key={r.id} className="border-emerald-300/60 dark:border-emerald-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold">{r.label}</p>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      Vence el {formatDate(r.expires_at)}
                    </p>
                  </div>
                  <Badge tone="success">Disponible</Badge>
                </div>

                <p className="mt-4 rounded-xl border border-dashed border-line bg-surface-sunken px-3.5 py-3 text-center font-mono text-[15px] font-semibold tracking-wider">
                  {r.code}
                </p>

                <Button
                  className="mt-3 w-full"
                  size="sm"
                  loading={redeem.isPending}
                  onClick={() => {
                    setError(null)
                    redeem.mutate(r.id, {
                      onError: (err) =>
                        setError(err instanceof ApiError ? err.message : 'No pudimos canjear'),
                    })
                  }}
                >
                  Marcar como usado
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-0">
            <EmptyState
              title="Aun no tienes recompensas"
              description={`Cada ${data.pointsPerReward} puntos te damos un ${data.rewardLabel.toLowerCase()}.`}
            />
          </Card>
        )}
      </div>

      {/* Historial de canjes */}
      {history.length ? (
        <div className="mt-8">
          <SectionHeader title="Canjes anteriores" />
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {history.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-[14px]">{r.label}</p>
                    <p className="mt-0.5 font-mono text-[12px] text-ink-subtle">{r.code}</p>
                  </div>
                  <div className="text-right">
                    <Badge tone={r.status === 'used' ? 'neutral' : 'warning'}>
                      {r.status === 'used' ? 'Usado' : 'Expirado'}
                    </Badge>
                    <p className="mt-1 text-[11px] text-ink-subtle">
                      {formatRelative(r.redeemed_at ?? r.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {/* Movimientos */}
      <div className="mt-8">
        <SectionHeader title="Movimientos" />
        <Card className="p-0">
          {data.ledger.length ? (
            <ul className="divide-y divide-line">
              {data.ledger.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[14px]">{entry.note ?? REASON[entry.reason] ?? entry.reason}</p>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      {formatRelative(entry.created_at)}
                    </p>
                  </div>
                  <p
                    className={
                      entry.delta >= 0
                        ? 'shrink-0 text-[14px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'
                        : 'shrink-0 text-[14px] font-semibold tabular-nums text-ink-muted'
                    }
                  >
                    {entry.delta > 0 ? '+' : ''}
                    {entry.delta}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-ink-subtle">
              Tus puntos apareceran aqui conforme hagamos trabajos.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
