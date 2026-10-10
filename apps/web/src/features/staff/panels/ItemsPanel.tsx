import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { cx } from '@/shared/colors'
import { formatMoney } from '@/lib/format'
import { Alert, Button, Card, Input, Select } from '@/components/ui'
import { IconPlus, IconTrash } from '@/components/icons'
import type { OrderDetail } from '@/lib/types'
import { invalidateOrder } from '@/lib/query-keys'

const KIND_LABEL: Record<string, string> = {
  part: 'Repuesto',
  labor: 'Mano de obra',
  service: 'Servicio',
}

/**
 * Presupuesto de la orden: los trabajos que se le cargan al cliente.
 *
 * Vive en su propio archivo porque lo usan la orden del taller y este detalle.
 */
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
      <div className="rule mb-2">
        <span className="eyebrow">Trabajos</span>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">
          {order.items.length}
        </span>
      </div>

      <ul className="mt-4 divide-y divide-line">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p
                className={cx(
                  'text-sm leading-snug',
                  item.status === 'cancelled' && 'text-ink-muted line-through',
                )}
              >
                {item.description}
              </p>
              <p className="eyebrow mt-1.5">
                {KIND_LABEL[item.kind] ?? item.kind}
                {item.qty > 1 ? ` · x${item.qty}` : ''}
                {item.applied_redemption_id ? ' · lavado canjeado' : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-medium tabular-nums">
                {formatMoney(Math.round(item.qty * item.unit_price_cents), order.order.currency)}
              </span>
              <button
                type="button"
                onClick={() => remove.mutate(item.id)}
                aria-label={`Quitar ${item.description}`}
                className="flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        {!order.items.length ? (
          <li className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
            Sin trabajos registrados
          </li>
        ) : null}
      </ul>

      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="eyebrow">Total</span>
        <span className="font-display text-xl leading-none tabular-nums">
          {formatMoney(order.order.total_cents, order.order.currency)}
        </span>
      </div>

      <form
        className="mt-5 space-y-3 border-t border-line pt-5"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          add.mutate()
        }}
      >
        {error ? <Alert>{error}</Alert> : null}

        <div className="grid gap-2 sm:grid-cols-[8rem_1fr_5rem_7rem]">
          <Select
            value={form.kind}
            aria-label="Tipo de trabajo"
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          >
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

        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={add.isPending}
          icon={<IconPlus className="h-4 w-4" />}
        >
          Agregar trabajo
        </Button>
      </form>
    </Card>
  )
}