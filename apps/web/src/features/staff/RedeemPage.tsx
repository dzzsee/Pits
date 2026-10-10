import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Skeleton,
} from '@/components/ui'
import { IconGift } from '@/components/icons'
import type { Redemption } from '@/lib/types'
import { keys } from '@/lib/query-keys'

export function RedeemPage() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  )

  const { data, isLoading } = useQuery({
    queryKey: keys.redemptions(),
    queryFn: () => api.get<{ items: Redemption[] }>('/staff/redemptions'),
  })

  const redeem = useMutation({
    mutationFn: (value: string) =>
      api.post(`/staff/redemptions/${value.trim().toUpperCase()}/redeem`),
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
    <div className="enter max-w-4xl">
      <PageHeader
        eyebrow="Taller"
        title="Canjes"
        subtitle="El cliente te muestra su codigo. Escribelo aqui para marcarlo como usado."
      />

      <Card className="mb-10">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setFeedback(null)
            redeem.mutate(code)
          }}
        >
          <Field label="Codigo del cliente" className="min-w-[14rem] flex-1">
            {(props) => (
              <Input
                {...props}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="PITS-ABCD-1234"
                // Se escribe un codigo: mono y espaciado amplio para no
                // confundir la O con el cero al dictarlo.
                className="font-mono text-lg uppercase tracking-[0.18em]"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>

          <Button type="submit" loading={redeem.isPending} disabled={code.trim().length < 8}>
            Canjear
          </Button>
        </form>

        {feedback ? (
          <div className="mt-4">
            <Alert tone={feedback.tone}>{feedback.text}</Alert>
          </div>
        ) : null}
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card className="p-0">
          <EmptyState
            icon={<IconGift className="h-14 w-14" />}
            title="Sin canjes"
            description="Aun nadie ha canjeado un lavado."
          />
        </Card>
      ) : (
        <div className="space-y-12">
          <div>
            <div className="rule mb-4">
              <span className="eyebrow">Disponibles</span>
              <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                {available.length}
              </span>
            </div>

            {available.length ? (
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {available.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-hover"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold tracking-[0.12em]">{r.code}</p>
                        <p className="mt-1.5 text-[13px] text-ink-muted">
                          {r.client_name} · {r.label}
                        </p>
                        <p className="eyebrow mt-1.5">Vence {formatDate(r.expires_at)}</p>
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
              <div className="rule mb-4">
                <span className="eyebrow">Ya canjeados</span>
                <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                  {used.length}
                </span>
              </div>
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {used.slice(0, 20).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="font-mono text-[13px] tracking-[0.1em] text-ink-muted">
                          {r.code}
                        </p>
                        <p className="mt-1 text-[13px] text-ink-muted">{r.client_name}</p>
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