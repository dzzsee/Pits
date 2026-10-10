import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatDate, formatRelative } from '@/lib/format'
import {
  Alert,
  Badge,
  Button,
  Card,
  CounterBar,
  CounterDivider,
  EmptyState,
  PageHeader,
  ProgressBar,
  Skeleton,
  StatCounter,
} from '@/components/ui'
import { IconArrowDown, IconArrowUp, IconGift } from '@/components/icons'
import { cx } from '@/shared/colors'
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
      <div className="space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (!data) return null

  const available = data.redemptions.filter((r) => r.status === 'available')
  const history = data.redemptions.filter((r) => r.status !== 'available')
  const ready = data.repairsUntilReward === 0

  return (
    <div className="enter">
      <PageHeader
        eyebrow="Tu taller"
        title="Fidelizacion"
        subtitle={`${data.lifetime_points} puntos acumulados de por vida`}
      />

      {/* Saldo y progreso hacia la siguiente recompensa. */}
      <Card>
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="eyebrow">Puntos disponibles</p>
            <p className="stat-value mt-3 text-[clamp(4rem,9vw,6rem)] text-accent">
              {data.points_balance}
            </p>
          </div>

          <div className="sm:pt-2">
            <div className="mb-3 flex items-baseline justify-between font-mono text-[11px] text-ink-muted">
              <span>{ready ? 'Recompensa lista' : `Faltan ${data.remaining} pts`}</span>
              <span className="tabular-nums">
                {data.points_balance} / {data.pointsPerReward}
              </span>
            </div>

            <ProgressBar value={data.percent} max={100} label="Progreso hacia la recompensa" />

            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              {ready ? (
                <>Muestra tu codigo en recepcion la proxima vez que vengas.</>
              ) : (
                <>
                  A {data.repairsUntilReward}{' '}
                  {data.repairsUntilReward === 1 ? 'reparacion' : 'reparaciones'} mas te ganamos un{' '}
                  <strong className="font-medium text-ink">{data.rewardLabel.toLowerCase()}</strong>.
                </>
              )}
            </p>
          </div>
        </div>

        <CounterBar className="mt-8 border-t border-line !py-5 !bg-transparent">
          <StatCounter value={`+${data.pointsPerRepair}`} label="Cada reparacion" />
          <CounterDivider />
          <StatCounter value={data.rewards_redeemed} label="Canjeados" />
          <CounterDivider />
          <StatCounter value={data.pointsPerReward} label="Puntos por premio" />
        </CounterBar>
      </Card>

      {/* Recompensas disponibles: el codigo es lo tangible de toda la pagina. */}
      <div className="mt-12">
        <div className="rule mb-4">
          <span className="eyebrow">Tus recompensas</span>
          {available.length ? (
            <span className="font-mono text-[11px] tabular-nums text-ink-muted">
              {available.length}
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        {available.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {available.map((r) => (
              <Card key={r.id} className="border-ok/30 bg-ok/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-medium">{r.label}</p>
                    <p className="eyebrow mt-1.5">Vence el {formatDate(r.expires_at)}</p>
                  </div>
                  <Badge tone="success">Disponible</Badge>
                </div>

                {/* El codigo se lee de un vistazo: asi lo enseñas en recepcion. */}
                <p className="mt-5 rounded border border-dashed border-ok/40 bg-bg px-3 py-4 text-center font-mono text-xl font-semibold tracking-[0.2em] text-ok">
                  {r.code}
                </p>

                <Button
                  className="mt-4 w-full"
                  size="sm"
                  variant="secondary"
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
              icon={<IconGift className="h-14 w-14" />}
              title="Aun no tienes recompensas"
              description={`Cada ${data.pointsPerReward} puntos te damos un ${data.rewardLabel.toLowerCase()}.`}
            />
          </Card>
        )}
      </div>

      {/* Historial de canjes */}
      {history.length ? (
        <div className="mt-12">
          <div className="rule mb-4">
            <span className="eyebrow">Canjes anteriores</span>
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {history.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm">{r.label}</p>
                    <p className="mt-1 font-mono text-[11px] tracking-[0.06em] text-ink-muted">
                      {r.code}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={r.status === 'used' ? 'neutral' : 'danger'}>
                      {r.status === 'used' ? 'Usado' : 'Expirado'}
                    </Badge>
                    <p className="mt-1.5 font-mono text-[11px] text-ink-muted">
                      {formatRelative(r.redeemed_at ?? r.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {/* Movimientos: un libro deContabilidad, con el signo a la derecha. */}
      <div className="mt-12">
        <div className="rule mb-4">
          <span className="eyebrow">Movimientos</span>
        </div>
        <Card className="p-0">
          {data.ledger.length ? (
            <ul className="divide-y divide-line">
              {data.ledger.map((entry) => {
                const positive = entry.delta >= 0
                return (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cx(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          positive ? 'bg-ok/10 text-ok' : 'bg-surface-hover text-ink-muted',
                        )}
                        aria-hidden="true"
                      >
                        {positive ? (
                          <IconArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <IconArrowDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          {entry.note ?? REASON[entry.reason] ?? entry.reason}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-muted/70">
                          {formatRelative(entry.created_at)}
                        </p>
                      </div>
                    </div>

                    <p
                      className={cx(
                        'shrink-0 font-mono text-sm font-semibold tabular-nums',
                        positive ? 'text-ok' : 'text-ink-muted',
                      )}
                    >
                      {entry.delta > 0 ? '+' : ''}
                      {entry.delta}
                    </p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-ink-muted">
              Tus puntos apareceran aqui conforme hagamos trabajos.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}