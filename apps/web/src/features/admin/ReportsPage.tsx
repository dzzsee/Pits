import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { downloadCsv, api } from '@/lib/api'
import { cx, stateColor } from '@/shared/colors'
import { formatDate, formatMoney, formatRelative, pluralize } from '@/lib/format'
import { Badge, Button, Card, Field, Input, SectionHeader, Skeleton } from '@/components/ui'
import type { ReportsSummary } from '@/lib/types'
import { keys } from '@/lib/query-keys'

export function ReportsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)

  const query = useQuery({
    queryKey: keys.reports(from, to),
    queryFn: () => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const qs = params.toString()
      return api.get<ReportsSummary>(`/admin/reports/summary${qs ? `?${qs}` : ''}`)
    },
  })

  const r = query.data

  async function exportCsv() {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const qs = params.toString()
      await downloadCsv(
        `/admin/reports/export.csv${qs ? `?${qs}` : ''}`,
        `pits-reparaciones-${new Date().toISOString().slice(0, 10)}.csv`,
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="mt-1 text-sm text-ink-muted">Como va el taller y el programa de puntos.</p>
        </div>
        <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting}>
          Exportar CSV
        </Button>
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-40" label="Desde">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field className="w-40" label="Hasta">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {(from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom('')
                setTo('')
              }}
            >
              Limpiar
            </Button>
          )}
        </div>
      </Card>

      {query.isLoading || !r ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Ingresos" value={formatMoney(r.revenue.totalCents)} accent />
            <Metric label="Entregadas" value={String(r.orders.delivered)} />
            <Metric label="En curso" value={String(r.orders.open)} />
            <Metric label="Clientes" value={String(r.loyalty.clients)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <SectionHeader title="Estados actuales" />
              {r.states.length ? (
                <ul className="space-y-2.5">
                  {r.states.slice(0, 8).map((s) => {
                    const total = r.states.reduce((acc, x) => acc + x.count, 0) || 1
                    const pct = Math.round((s.count / total) * 100)
                    const color = stateColor(s.color)
                    return (
                      <li key={s.label}>
                        <div className="mb-1 flex items-center justify-between text-[13px]">
                          <span className="flex items-center gap-2">
                            <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
                            {s.label}
                          </span>
                          <span className="tabular-nums text-ink-muted">{s.count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            className={cx('h-full rounded-full', color.bar)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-ink-subtle">Sin datos.</p>
              )}
            </Card>

            <Card>
              <SectionHeader title="Ingresos por mes" />
              {r.revenue.byMonth.length ? (
                <ul className="space-y-2.5">
                  {r.revenue.byMonth.map((m) => {
                    const max = Math.max(...r.revenue.byMonth.map((x) => x.cents)) || 1
                    return (
                      <li key={m.month}>
                        <div className="mb-1 flex items-center justify-between text-[13px]">
                          <span className="tabular-nums text-ink-muted">{m.month}</span>
                          <span className="tabular-nums font-medium">
                            {formatMoney(m.cents)} · {pluralize(m.count, 'orden', 'ordenes')}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                          <div
                            className="h-full rounded-full bg-ink"
                            style={{ width: `${Math.round((m.cents / max) * 100)}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-ink-subtle">Sin ingresos en el periodo.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-0">
              <div className="px-5 pt-5">
                <SectionHeader title="Clientes frecuentes" />
              </div>
              <ul className="divide-y divide-line">
                {r.loyalty.topClients.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-[14px] font-medium">{c.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink-subtle">
                        {pluralize(c.repairs, 'visita', 'visitas')}
                      </p>
                    </div>
                    <Badge tone={c.points > 0 ? 'success' : 'neutral'}>{c.points} pts</Badge>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-0">
              <div className="px-5 pt-5">
                <SectionHeader title="Contratiempos" description="Lo que el mecanico marco como aviso." />
              </div>
              {r.incidents.length ? (
                <ul className="divide-y divide-line">
                  {r.incidents.map((i) => (
                    <li key={`${i.orderId}-${i.created_at}`} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[12px]">{i.code}</span>
                        <span className="text-[12px] text-ink-subtle">
                          {formatRelative(i.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px]">{i.state}</p>
                      {i.note ? (
                        <p className="mt-0.5 text-[13px] text-ink-muted">{i.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 pb-8 text-sm text-ink-subtle">Sin contratiempos.</p>
              )}
            </Card>
          </div>

          <Card className="p-0">
            <div className="px-5 pt-5">
              <SectionHeader title="Produccion por mecanico" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-ink-subtle">
                    <th className="px-5 py-2 font-medium">Mecanico</th>
                    <th className="px-5 py-2 text-right font-medium">Ordenes</th>
                    <th className="px-5 py-2 text-right font-medium">Facturado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.mechanics.map((m) => (
                    <tr key={m.id}>
                      <td className="px-5 py-2.5 font-medium">{m.name}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{m.orders}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {formatMoney(m.revenueCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-center text-[12px] text-ink-subtle">
            Periodo: {formatDate(r.range.from)} — {formatDate(r.range.to)}
          </p>
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <Card className="p-4">
      <p className="text-[12px] uppercase tracking-wide text-ink-subtle">{label}</p>
      <p
        className={cx(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          accent && 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {value}
      </p>
    </Card>
  )
}
