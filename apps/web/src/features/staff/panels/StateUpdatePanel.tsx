import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { cx, stateColor } from '@/shared/colors'
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Toggle,
} from '@/components/ui'
import type { OrderDetail, RepairState, TransitionResult } from '@/lib/types'
import { invalidateOrder, keys } from '@/lib/query-keys'

/**
 * Cambio de estado de una orden.
 *
 * El estado lo escribe el mecanico con sus propias palabras. Solo sugerimos
 * atajos: si escribe algo nuevo, el servidor lo crea como estado personalizado
 * del taller.
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
      (statesData?.items ?? []).filter((s) => s.id !== order.order.state_id && s.is_active === 1),
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
      <div className="rule mb-2">
        <span className="eyebrow">Actualizar estado</span>
      </div>
      <p className="mb-5 text-[13px] leading-relaxed text-ink-muted">
        Escribe el estado como lo dirias en el taller. Los estados nuevos se guardan solos.
      </p>

      <form
        className="space-y-4"
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
            {result.rewardsGranted.length > 0 ? ' · lavado ganado' : ''}
          </Alert>
        ) : null}

        <Field label="Estado">
          {(props) => (
            <>
              <Input
                {...props}
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
            </>
          )}
        </Field>

        {/* Atajos: los estados que el taller ya usa, de un clic. */}
        {suggestions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 8).map((s) => {
              const c = stateColor(s.color)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setState(s.label)}
                  className={cx(
                    'rounded-full px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] transition-opacity hover:opacity-75',
                    c.chip,
                  )}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        ) : null}

        <Field label="Nota tecnica">
          {(props) => (
            <Textarea
              {...props}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Pastillas delanteras desgastadas, se necesitan nuevas"
              rows={2}
            />
          )}
        </Field>

        <div className="space-y-3 rounded border border-line bg-surface-hover p-3.5">
          <Toggle
            checked={notifyClient}
            onChange={setNotifyClient}
            label="Notificar al cliente"
            description="Le llega un push con este cambio."
          />
          <Toggle
            checked={isIncident}
            onChange={setIsIncident}
            label="Marcar como contratiempo"
            description="Se destaca en rojo en su app."
          />
        </div>

        <Button type="submit" loading={transition.isPending} disabled={state.trim().length < 2}>
          Actualizar
        </Button>
      </form>
    </Card>
  )
}