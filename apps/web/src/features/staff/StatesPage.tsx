import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { cx, stateColor, stateColorClasses } from '@/shared/colors'
import { Alert, Badge, Button, Card, Field, Input, SectionHeader, Skeleton } from '@/components/ui'
import type { RepairState, RepairStatePatch, StateColor } from '@/lib/types'
import { keys } from '@/lib/query-keys'

const PALETTE = Object.keys(stateColorClasses)

export function StatesPage() {
  const queryClient = useQueryClient()
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: keys.repairStatesFull(),
    queryFn: () => api.get<{ items: RepairState[] }>('/staff/repair-states?includeInactive=1'),
  })

  // Sin argumentos invalida tambien `keys.repairStates()`, que es la vista
  // corta que consume el panel de cambio de estado.
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: keys.repairStates() })

  const create = useMutation({
    mutationFn: () => api.post<RepairState>('/staff/repair-states', { label: newLabel.trim() }),
    onSuccess: () => {
      setNewLabel('')
      invalidate()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No pudimos crear'),
  })

  const patch = useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: RepairStatePatch }) =>
      api.patch(`/staff/repair-states/${id}`, changes),
    onSuccess: invalidate,
  })

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Estados</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Los estados son tuyos: escribe el que necesites y aparece solo cuando lo usas. Marca
          <strong> entrega</strong> los que cierran una reparacion y dan los puntos.
        </p>
      </div>

      <Card className="mb-5">
        <SectionHeader title="Agregar estado" />
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            create.mutate()
          }}
        >
          {error ? (
            <div className="w-full">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          <Field className="min-w-[14rem] flex-1" label="Nombre">
            <Input
              required
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Esperando repuesto"
            />
          </Field>
          <Button type="submit" loading={create.isPending} disabled={newLabel.trim().length < 2}>
            Agregar
          </Button>
        </form>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {(data?.items ?? []).map((s) => (
            <StateRow key={s.id} state={s} patch={patch} />
          ))}
        </ul>
      )}
    </div>
  )
}

function StateRow({
  state,
  patch,
}: {
  state: RepairState
  patch: { mutate: (v: { id: number; changes: RepairStatePatch }) => void }
}) {
  const color = stateColor(state.color)
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(state.label)

  return (
    <li
      className={cx(
        'card px-4 py-3 transition-opacity',
        state.is_active === 0 && 'opacity-50',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className={cx('h-8 w-1 shrink-0 rounded-full', color.bar)} aria-hidden="true" />

        {editing ? (
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="max-w-xs"
            autoFocus
          />
        ) : (
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[15px] font-medium">
              {state.label}
              {state.is_terminal === 1 ? (
                <Badge tone="success">entrega</Badge>
              ) : null}
              {state.is_incident === 1 ? <Badge tone="danger">contratiempo</Badge> : null}
              {state.is_custom === 1 ? <Badge>creado por ti</Badge> : null}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-subtle">
              {state.is_active === 0 ? 'Archivado' : 'Activo'}
              {state.is_suggested === 1 ? ' · sugerido' : ''}
            </p>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <Button
                size="sm"
                onClick={() => {
                  patch.mutate({ id: state.id, changes: { label } })
                  setEditing(false)
                }}
              >
                Guardar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLabel(state.label)
                  setEditing(false)
                }}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Renombrar
              </Button>
              {state.is_active === 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch.mutate({ id: state.id, changes: { isActive: true } })}
                >
                  Reactivar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch.mutate({ id: state.id, changes: { isActive: false } })}
                >
                  Archivar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-subtle">Color</span>
            <div className="flex gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => patch.mutate({ id: state.id, changes: { color: c as StateColor } })}
                  aria-label={`Color ${c}`}
                  className={cx(
                    'h-4 w-4 rounded-full transition-transform',
                    stateColorClasses[c]!.dot,
                    state.color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface-raised',
                  )}
                />
              ))}
            </div>
          </div>

          <TogglePill
            active={state.is_terminal === 1}
            label="Es entrega"
            hint="Cierra la orden y otorga los puntos"
            onClick={() =>
              patch.mutate({ id: state.id, changes: { isTerminal: state.is_terminal !== 1 } })
            }
          />
          <TogglePill
            active={state.is_incident === 1}
            label="Contratiempo"
            hint="Se destaca en rojo para el cliente"
            onClick={() =>
              patch.mutate({ id: state.id, changes: { isIncident: state.is_incident !== 1 } })
            }
          />
        </div>
      ) : null}
    </li>
  )
}

function TogglePill({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cx(
        'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'bg-ink text-brand-ink'
          : 'bg-surface-sunken text-ink-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}
