import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { Alert, Badge, Button, Card, EmptyState, Input, SectionHeader, Skeleton } from '@/components/ui'
import type { Redemption } from '@/lib/types'
import { keys } from '@/lib/query-keys'

export function RedeemPage() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: keys.redemptions(),
    queryFn: () => api.get<{ items: Redemption[] }>('/staff/redemptions'),
  })

  const redeem = useMutation({
    mutationFn: (value: string) => api.post(`/staff/redemptions/${value.trim().toUpperCase()}/redeem`),
    onSuccess: async (_data, value) => {
      setFeedback({ tone: 'success', text: `Codigo ${value.toUpperCase()} canjeado` })
      setCode('')
      await queryClient.invalidateQueries({ queryKey: keys.redemptions() })
    },
    onError: (err) =>
      setFeedback({
        tone: 'danger',
        text: err instanceof ApiError ? err.message : 'No pudimos canjear el codigo',
      }),
  })

  const available = data?.items.filter((r) => r.status === 'available') ?? []
  const used = data?.items.filter((r) => r.status === 'used') ?? []

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Canjes</h1>
        <p className="mt-1 text-sm text-ink-muted">
          El cliente te muestra su codigo. Escribelo aqui para marcarlo como usado.
        </p>
      </div>

      <Card className="mb-6">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setFeedback(null)
            redeem.mutate(code)
          }}
        >
          <div className="min-w-[14rem] flex-1">
            <label className="label" htmlFor="redeem-code">
              Codigo del cliente
            </label>
            <Input
              id="redeem-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PITS-ABCD-1234"
              className="font-mono uppercase"
              autoComplete="off"
            />
          </div>
          <Button type="submit" loading={redeem.isPending} disabled={code.trim().length < 8}>
            Canjear
          </Button>
        </form>

        {feedback ? (
          <div className="mt-3">
            <Alert tone={feedback.tone}>{feedback.text}</Alert>
          </div>
        ) : null}
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card className="p-0">
          <EmptyState title="Sin canjes" description="Aun nadie ha canjeado un lavado." />
        </Card>
      ) : (
        <div className="space-y-8">
          <div>
            <SectionHeader title={`Disponibles (${available.length})`} />
            {available.length ? (
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {available.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-mono text-[14px] font-medium tracking-wide">{r.code}</p>
                        <p className="mt-0.5 text-[12px] text-ink-subtle">
                          {r.client_name} · {r.label} · vence {formatDate(r.expires_at)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={redeem.isPending}
                        onClick={() => {
                          setFeedback(null)
                          redeem.mutate(r.code)
                        }}
                      >
                        Usar
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card className="p-0">
                <EmptyState title="Nada pendiente" description="No hay codigos sin usar." />
              </Card>
            )}
          </div>

          {used.length ? (
            <div>
              <SectionHeader title={`Ya canjeados (${used.length})`} />
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {used.slice(0, 20).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div>
                        <p className="font-mono text-[13px] text-ink-muted">{r.code}</p>
                        <p className="mt-0.5 text-[12px] text-ink-subtle">{r.client_name}</p>
                      </div>
                      <Badge tone="neutral">Usado {formatDate(r.redeemed_at)}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
