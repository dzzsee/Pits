import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { useSession } from '@/app/session'
import { cx, stateColor } from '@/shared/colors'
import { formatDate, formatMoney, formatRelative } from '@/lib/format'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui'
import type { OrderDetail, OrderSummary, RepairState, TransitionResult } from '@/lib/types'
import { invalidateOrder, keys } from '@/lib/query-keys'

interface OrdersResponse {
  items: OrderSummary[]
  total: number
}

const FILTERS = [
  { value: 'open', label: 'En curso' },
  { value: '', label: 'Todas' },
  { value: 'delivered', label: 'Entregadas' },
  { value: 'cancelled', label: 'Canceladas' },
] as const

export function WorkshopPage() {
  const { user } = useSession()
  const [status, setStatus] = useState<string>('open')
  const [q, setQ] = useState('')

  const query = useQuery({
    queryKey: keys.staffRepairs(status, q),
    queryFn: () =>
      api.get<OrdersResponse>(
        `/staff/repairs?limit=100${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  })

  const orders = query.data?.items ?? []

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ordenes</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {query.data ? `${query.data.total} en total` : 'Cargando...'}
            {user?.role === 'mechanic' ? ' · tus ordenes asignadas' : ''}
          </p>
        </div>
        <Link to="/taller/nueva">
          <Button icon={<IconPlus className="h-4 w-4" />}>Nueva orden</Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-surface-sunken p-1">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatus(f.value)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                status === f.value
                  ? 'bg-surface-raised text-ink shadow-card'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por codigo, placa o cliente"
          className="max-w-xs"
          aria-label="Buscar ordenes"
        />
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !orders.length ? (
        <Card className="p-0">
          <EmptyState title="Sin ordenes" description="No hay ordenes que coincidan con el filtro." />
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderRow({ order }: { order: OrderSummary }) {
  const color = stateColor(order.state_color)
  return (
    <Link
      to={`/taller/orden/${order.id}`}
      className="card flex items-center gap-4 px-4 py-3.5 transition-shadow duration-150 hover:shadow-lift"
    >
      <span className={cx('h-9 w-1 shrink-0 rounded-full', color.bar)} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-[12px] text-ink-subtle">{order.code}</span>
          <span className="truncate text-[15px] font-medium">{order.vehicle_label}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {formatDate(order.created_at)} · {formatRelative(order.state_changed_at)}
        </p>
      </div>

      <span
        className={cx(
          'hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium sm:inline-flex',
          color.chip,
        )}
      >
        <span className={cx('h-1.5 w-1.5 rounded-full', color.dot)} />
        {order.state_label ?? 'Sin estado'}
      </span>

      <span className="shrink-0 text-[14px] font-semibold tabular-nums">
        {formatMoney(order.total_cents, order.currency)}
      </span>
    </Link>
  )
}

/* ------------------------------------------------------------------ *
 * Panel de cambio de estado
 * ------------------------------------------------------------------ */

/**
 * El estado lo escribe el mecanico. Solo sugerimos atajos: si escribe algo
 * nuevo, el servidor lo crea como estado personalizado del taller.
 */
export function StateUpdatePanel({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState(order.order.state_label ?? '')
  const [note, setNote] = useState('')
  const [notifyClient, setNotifyClient] = useState(true)
  const [isIncident, setIsIncident] = useState(false)
  const [result, setResult] = useState<TransitionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: statesData } = useQuery({
    queryKey: keys.repairStates(),
    queryFn: () => api.get<{ items: RepairState[] }>('/staff/repair-states'),
  })

  const suggestions = useMemo(
    () =>
      (statesData?.items ?? []).filter(
        (s) => s.id !== order.order.state_id && s.is_active === 1,
      ),
    [statesData, order.order.state_id],
  )

  const transition = useMutation({
    mutationFn: () =>
      api.post<TransitionResult>(`/staff/repairs/${order.order.id}/transition`, {
        state: state.trim(),
        note: note.trim() || null,
        notifyClient,
        isClientVisible: true,
        isIncident,
      }),
    onSuccess: async (data) => {
      setResult(data)
      setNote('')
      setIsIncident(false)
      // `await`: la mutacion no termina hasta que la pantalla ya muestra el
      // estado nuevo. Sin esto el Alert de exito sale antes de que la vista
      // cambie y se ve un estado inconsistente.
      await invalidateOrder(queryClient, order.order.id)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No pudimos actualizar'),
  })

  return (
    <Card>
      <h2 className="text-[15px] font-semibold tracking-tight">Actualizar estado</h2>
      <p className="mt-1 text-[13px] text-ink-muted">
        Escribe el estado como lo dirias en el taller. Los estados nuevos se guardan solos.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setResult(null)
          transition.mutate()
        }}
      >
        {error ? <Alert>{error}</Alert> : null}
        {result ? (
          <Alert tone="success">
            {result.state.label}
            {result.delivered ? ' · orden entregada' : ''}
            {result.pointsAwarded > 0 ? ` · +${result.pointsAwarded} puntos` : ''}
            {result.rewardsGranted.length > 0 ? ` · lavado ganado` : ''}
          </Alert>
        ) : null}

        <div>
          <label className="label" htmlFor="state-input">
            Estado
          </label>
          <Input
            id="state-input"
            list="state-suggestions"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Esperando repuesto"
            autoComplete="off"
          />
          <datalist id="state-suggestions">
            {suggestions.map((s) => (
              <option key={s.id} value={s.label}>
                {s.is_terminal === 1 ? '(entrega)' : ''}
              </option>
            ))}
          </datalist>

          {suggestions.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.slice(0, 8).map((s) => {
                const c = stateColor(s.color)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setState(s.label)}
                    className={cx(
                      'rounded-full px-2.5 py-1 text-[12px] font-medium transition-opacity hover:opacity-80',
                      c.chip,
                    )}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="state-note">
            Nota tecnica
          </label>
          <Textarea
            id="state-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Pastillas delanteras desgastadas, se necesitan nuevas"
            rows={2}
          />
        </div>

        <div className="space-y-2 rounded-xl bg-surface-sunken/70 px-3.5 py-3">
          <Toggle
            checked={notifyClient}
            onChange={setNotifyClient}
            label="Notificar al cliente"
            hint="Le llega un push con este cambio."
          />
          <Toggle
            checked={isIncident}
            onChange={setIsIncident}
            label="Marcar como contratiempo"
            hint="Se destaca en rojo en su app."
          />
        </div>

        <Button type="submit" loading={transition.isPending} disabled={state.trim().length < 2}>
          Actualizar
        </Button>
      </form>
    </Card>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-ink focus:ring-2 focus:ring-brand/30"
      />
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[12px] text-ink-subtle">{hint}</span>
      </span>
    </label>
  )
}

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

export function ItemsPanel({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ kind: 'part', description: '', qty: '1', price: '' })
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: () =>
      api.post(`/staff/repairs/${order.order.id}/items`, {
        kind: form.kind,
        description: form.description.trim(),
        qty: Number(form.qty) || 1,
        unitPriceCents: Math.round((Number(form.price) || 0) * 100),
      }),
    onSuccess: async () => {
      setForm({ kind: 'part', description: '', qty: '1', price: '' })
      await invalidateOrder(queryClient, order.order.id)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No pudimos agregar'),
  })

  const remove = useMutation({
    mutationFn: (itemId: number) => api.del(`/staff/items/${itemId}`),
    onSuccess: async () => {
      await invalidateOrder(queryClient, order.order.id)
    },
  })

  return (
    <Card>
      <h2 className="text-[15px] font-semibold tracking-tight">Trabajos</h2>

      <ul className="mt-4 divide-y divide-line">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p
                className={cx(
                  'text-[14px] leading-snug',
                  item.status === 'cancelled' && 'text-ink-subtle line-through',
                )}
              >
                {item.description}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-subtle">
                {item.kind === 'part' ? 'Repuesto' : item.kind === 'labor' ? 'Mano de obra' : 'Servicio'}
                {item.qty > 1 ? ` · x${item.qty}` : ''}
                {item.applied_redemption_id ? ' · lavado canjeado' : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[14px] font-medium tabular-nums">
                {formatMoney(Math.round(item.qty * item.unit_price_cents), order.order.currency)}
              </span>
              <button
                type="button"
                onClick={() => remove.mutate(item.id)}
                className="text-[12px] text-ink-subtle hover:text-rose-600"
                aria-label={`Quitar ${item.description}`}
              >
                Quitar
              </button>
            </div>
          </li>
        ))}
        {!order.items.length ? (
          <li className="py-6 text-center text-sm text-ink-subtle">Sin trabajos registrados.</li>
        ) : null}
      </ul>

      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-[14px] font-semibold">Total</span>
        <span className="text-[15px] font-semibold tabular-nums">
          {formatMoney(order.order.total_cents, order.order.currency)}
        </span>
      </div>

      <form
        className="mt-4 space-y-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          add.mutate()
        }}
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-2 sm:grid-cols-[8rem_1fr_5rem_7rem]">
          <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
            <option value="part">Repuesto</option>
            <option value="labor">Mano de obra</option>
            <option value="service">Servicio</option>
          </Select>
          <Input
            required
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Pastillas delanteras"
          />
          <Input
            type="number"
            min="0.5"
            step="0.5"
            value={form.qty}
            onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
            aria-label="Cantidad"
          />
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="85.00"
            aria-label="Precio unitario"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" loading={add.isPending}>
          Agregar trabajo
        </Button>
      </form>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Facturacion
 * ------------------------------------------------------------------ */

export function InvoicePanel({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState('efectivo')

  const issue = useMutation({
    mutationFn: () =>
      api.post<{ number: string; total_cents: number; status: string }>(
        `/staff/repairs/${order.order.id}/invoice`,
        { paymentMethod: method, markPaid: true },
      ),
    onSuccess: async () => {
      await invalidateOrder(queryClient, order.order.id)
      await queryClient.invalidateQueries({ queryKey: keys.notifications() })
    },
    onError: () => undefined,
  })

  if (order.invoice) {
    return (
      <Card>
        <h2 className="text-[15px] font-semibold tracking-tight">Facturacion</h2>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-sunken px-4 py-3">
          <div>
            <p className="font-mono text-[14px]">{order.invoice.number}</p>
            <p className="mt-0.5 text-[12px] text-ink-subtle">
              {formatMoney(order.invoice.total_cents, order.order.currency)}
            </p>
          </div>
          <Badge tone={order.invoice.status === 'paid' ? 'success' : 'warning'}>
            {order.invoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
          </Badge>
        </div>
      </Card>
    )
  }

  if (order.order.status !== 'delivered') {
    return (
      <Card>
        <h2 className="text-[15px] font-semibold tracking-tight">Facturacion</h2>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Se puede facturar cuando el vehiculo se marque como entregado.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-[15px] font-semibold tracking-tight">Facturacion</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem]">
          <label className="label" htmlFor="pay-method">
            Metodo de pago
          </label>
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </Select>
        </div>
        <Button onClick={() => issue.mutate()} loading={issue.isPending}>
          Cobrar {formatMoney(order.order.total_cents, order.order.currency)}
        </Button>
      </div>
    </Card>
  )
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}
