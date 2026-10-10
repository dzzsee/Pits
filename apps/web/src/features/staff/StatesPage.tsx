import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { cx, stateColor, stateColorClasses, statePalette } from '@/shared/colors'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Skeleton,
} from '@/components/ui'
import { IconCheck, IconEdit } from '@/components/icons'
import type { RepairState, RepairStatePatch, StateColor } from '@/lib/types'
import { keys } from '@/lib/query-keys'

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

  const states = data?.items ?? []

  return (
    <div className="enter max-w-4xl">
      <PageHeader
        eyebrow="Taller"
        title="Estados"
        subtitle={
          <>
            Los estados son tuyos: escribe el que necesites y aparece solo cuando lo usas. Marca{' '}
            <strong className="font-medium text-ink">entrega</strong> los que cierran una
            reparacion y dan los puntos.
          </>
        }
      />

      <Card className="mb-8">
        <div className="rule mb-4">
          <span className="eyebrow">Agregar estado</span>
        </div>

        <form
          className="flex flex-wrap items-end gap-3"
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

          <Field label="Nombre" className="min-w-[14rem] flex-1">
            {(props) => (
              <Input
                {...props}
                required
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Esperando repuesto"
              />
            )}
          </Field>

          <Button type="submit" loading={create.isPending} disabled={newLabel.trim().length < 2}>
            Agregar
          </Button>
        </form>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {states.map((s) => (
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
    <li className={cx('card px-5 py-4', state.is_active === 0 && 'opacity-55')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cx('h-9 w-1 shrink-0', color.bar)} aria-hidden="true" />

        {editing ? (
          <div className="min-w-[12rem] flex-1">
            <Input
              value={label}
              aria-label="Nuevo nombre del estado"
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg uppercase leading-none tracking-[0.02em]">
                {state.label}
              </span>
              {state.is_terminal === 1 ? <Badge tone="success">entrega</Badge> : null}
              {state.is_incident === 1 ? <Badge tone="danger">contratiempo</Badge> : null}
              {state.is_custom === 1 ? <Badge>creado por ti</Badge> : null}
            </p>
            <p className="eyebrow mt-2">
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
                icon={<IconCheck className="h-3.5 w-3.5" />}
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
              <Button
                size="sm"
                variant="ghost"
                icon={<IconEdit className="h-3.5 w-3.5" />}
                onClick={() => setEditing(true)}
              >
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
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-line pt-4">
          {/* Selector de color con el nombre debajo: es una decision de marca
              del estado, asi que cada muestra se identifica, no se adivina. */}
          <div>
            <p className="eyebrow mb-2">Color</p>
            <div className="flex flex-wrap gap-1.5">
              {statePalette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    patch.mutate({ id: state.id, changes: { color: c as StateColor } })
                  }
                  aria-label={`Color ${c}`}
                  aria-pressed={state.color === c}
                  title={c}
                  className={cx(
                    'h-5 w-5 rounded-full transition-transform duration-200 hover:scale-110',
                    stateColorClasses[c]!.dot,
                    state.color === c && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                  )}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FlagButton
              active={state.is_terminal === 1}
              label="Es entrega"
              hint="Cierra la orden y otorga los puntos"
              onClick={() =>
                patch.mutate({ id: state.id, changes: { isTerminal: state.is_terminal !== 1 } })
              }
            />
            <FlagButton
              active={state.is_incident === 1}
              label="Contratiempo"
              hint="Se destaca en rojo para el cliente"
              onClick={() =>
                patch.mutate({ id: state.id, changes: { isIncident: state.is_incident !== 1 } })
              }
            />
          </div>
        </div>
      ) : null}
    </li>
  )
}

/** Bandera booleana de un estado. Activa = invertida, como el sistema. */
function FlagButton({
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
      aria-pressed={active}
      className={cx(
        'rounded-full border px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-300',
        active
          ? 'border-accent bg-accent text-black'
          : 'border-line text-ink-muted hover:border-line-light hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}