import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { Badge, Button, Card, Field, Select } from '@/components/ui'
import { IconInvoice } from '@/components/icons'
import type { OrderDetail } from '@/lib/types'
import { invalidateOrder, keys } from '@/lib/query-keys'

/**
 * Cobro de la orden. Solo aplica cuando el vehiculo ya se marco como entregado:
 * facturar antes no tiene sentido, y el servidor lo rechaza igual.
 */
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
  })

  if (order.invoice) {
    return (
      <Card>
        <div className="rule mb-4">
          <span className="eyebrow">Facturacion</span>
        </div>
        <div className="flex items-center justify-between rounded border border-accent/30 bg-accent/[0.05] px-4 py-3.5">
          <div className="flex items-center gap-3">
            <IconInvoice className="h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="font-mono text-sm font-semibold tracking-[0.06em]">
                {order.invoice.number}
              </p>
              <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-muted">
                {formatMoney(order.invoice.total_cents, order.order.currency)}
              </p>
            </div>
          </div>
          <Badge tone={order.invoice.status === 'paid' ? 'success' : 'accent'}>
            {order.invoice.status === 'paid' ? 'Pagada' : 'Pendiente'}
          </Badge>
        </div>
      </Card>
    )
  }

  if (order.order.status !== 'delivered') {
    return (
      <Card>
        <div className="rule mb-2">
          <span className="eyebrow">Facturacion</span>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Se puede facturar cuando el vehiculo se marque como entregado.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <div className="rule mb-4">
        <span className="eyebrow">Facturacion</span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Metodo de pago" className="min-w-[10rem] flex-1">
          {(props) => (
            <Select {...props} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </Select>
          )}
        </Field>

        <Button onClick={() => issue.mutate()} loading={issue.isPending}>
          Cobrar {formatMoney(order.order.total_cents, order.order.currency)}
        </Button>
      </div>
    </Card>
  )
}