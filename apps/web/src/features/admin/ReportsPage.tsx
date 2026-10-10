import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { downloadCsv, api } from '@/lib/api'
import { cx, stateColor } from '@/shared/colors'
import { formatDate, formatMoney, formatRelative, pluralize } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  CounterBar,
  CounterDivider,
  DataTable,
  Field,
  Input,
  PageHeader,
  Skeleton,
  StatCounter,
} from '@/components/ui'
import { IconAlert, IconDownload } from '@/components/icons'
import type { ReportsSummary } from '@/lib/types'
import { keys } from '@/lib/query-keys'

type Mechanic = ReportsSummary['mechanics'][number]

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
    <div className="enter">
      <PageHeader
        eyebrow="Administracion"
        title="Reportes"
        subtitle="Como va el taller y el programa de puntos."
        action={
          <Button
            variant="secondary"
            onClick={() => void exportCsv()}
            loading={exporting}
            icon={<IconDownload className="h-4 w-4" />}
          >
            Exportar CSV
          </Button>
        }
      />

      <Card className="mb-8">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-40" label="Desde">
            {(props) => (
              <Input {...props} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            )}
          </Field>

          <Field className="w-40" label="Hasta">
            {(props) => (
              <Input {...props} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            )}
          </Field>

          {from || to ? (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom('')
                setTo('')
              }}
            >
              Limpiar
            </Button>
          ) : null}
        </div>
      </Card>

      {query.isLoading || !r ? (
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        <div className="space-y-10">
          <CounterBar>
            <StatCounter value={formatMoney(r.revenue.totalCents)} label="Ingresos" accent />
            <CounterDivider />
            <StatCounter value={r.orders.delivered} label="Entregadas" />
            <CounterDivider />
            <StatCounter value={r.orders.open} label="En curso" />
            <CounterDivider />
            <StatCounter value={r.loyalty.clients} label="Clientes" />
          </CounterBar>

          <div className="grid gap-8 lg:grid-cols-2">
            <Card>
              <div className="rule mb-5">
                <span className="eyebrow">Estados actuales</span>
              </div>
              <BarList
                items={r.states.slice(0, 8).map((s) => ({
                  key: s.label,
                  label: s.label,
                  value: s.count,
                  bar: stateColor(s.color).bar,
                  dot: stateColor(s.color).dot,
                }))}
                empty="Sin ordenes en el periodo."
              />
            </Card>

            <Card>
              <div className="rule mb-5">
                <span className="eyebrow">Ingresos por mes</span>
              </div>
              <BarList
                items={r.revenue.byMonth.map((m) => ({
                  key: m.month,
                  label: m.month,
                  value: m.cents,
                  caption: `${formatMoney(m.cents)} · ${pluralize(m.count, 'orden', 'ordenes')}`,
                  // Escala relativa al mes mas alto, no al total: si un mes
                  // dwarfs al resto, los demas se aplastan a cero.
                  max: Math.max(...r.revenue.byMonth.map((x) => x.cents)) || 1,
                }))}
                empty="Sin ingresos en el periodo."
              />
            </Card>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <Card className="p-0">
              <div className="rule px-5 pb-4 pt-5">
                <span className="eyebrow">Clientes frecuentes</span>
              </div>
              {r.loyalty.topClients.length ? (
                <ul className="divide-y divide-line">
                  {r.loyalty.topClients.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="eyebrow mt-1.5">
                          {pluralize(c.repairs, 'visita', 'visitas')}
                        </p>
                      </div>
                      <Badge tone={c.points > 0 ? 'success' : 'neutral'}>{c.points} pts</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-6 pb-10 text-center text-sm text-ink-muted">
                  Sin clientes con visitas.
                </p>
              )}
            </Card>

            <Card className="p-0">
              <div className="rule px-5 pb-4 pt-5">
                <span className="eyebrow">Contratiempos</span>
              </div>
              {r.incidents.length ? (
                <ul className="divide-y divide-line">
                  {r.incidents.map((i) => (
                    <li key={`${i.orderId}-${i.created_at}`} className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[11px] tracking-[0.06em] text-ink-muted">
                          {i.code}
                        </span>
                        <span className="font-mono text-[11px] text-ink-muted/70">
                          {formatRelative(i.created_at)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm">{i.state}</p>
                      {i.note ? (
                        <p className="mt-1 text-[13px] text-ink-muted">{i.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <IconAlert className="mb-4 h-10 w-10 text-ok/60" />
                  <p className="text-sm text-ink-muted">Sin contratiempos en el periodo.</p>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-0">
            <div className="rule px-5 pb-2 pt-5">
              <span className="eyebrow">Produccion por mecanico</span>
            </div>
            <div className="px-5 pb-5">
              <DataTable<Mechanic>
                rows={r.mechanics}
                getKey={(m) => String(m.id)}
                empty="Sin mecanicos con ordenes en el periodo."
                columns={[
                  {
                    key: 'name',
                    header: 'Mecanico',
                    render: (m) => <span className="font-medium">{m.name}</span>,
                  },
                  {
                    key: 'orders',
                    header: 'Ordenes',
                    align: 'right',
                    render: (m) => m.orders,
                  },
                  {
                    key: 'revenue',
                    header: 'Facturado',
                    align: 'right',
                    render: (m) => formatMoney(m.revenueCents),
                  },
                ]}
              />
            </div>
          </Card>

          <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
            Periodo {formatDate(r.range.from)} — {formatDate(r.range.to)}
          </p>
        </div>
      )}
    </div>
  )
}

interface BarItem {
  key: string
  label: string
  value: number
  caption?: string
  /** Escala de la barra. Si falta, se usa el maximo del propio listado. */
  max?: number
  bar?: string
  dot?: string
}

/**
 * Lista de barras horizontales con su valor. Se usa para distribuciones, no
 * para series de tiempo: la magnitud se lee en la etiqueta, no en la longitud
 * de la barra.
 */
function BarList({ items, empty }: { items: BarItem[]; empty: string }) {
  if (!items.length) {
    return <p className="py-8 text-center text-sm text-ink-muted">{empty}</p>
  }

  const scale = Math.max(...items.map((i) => i.max ?? i.value)) || 1

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const reference = item.max ?? scale
        const pct = reference > 0 ? Math.round((item.value / reference) * 100) : 0

        return (
          <li key={item.key}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {item.dot ? (
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', item.dot)} />
                ) : null}
                <span className="truncate font-mono text-[12px]">{item.label}</span>
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-muted">
                {item.caption ?? item.value}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <div
                className={cx('h-full rounded-full transition-[width] duration-500', item.bar ?? 'bg-ink')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}