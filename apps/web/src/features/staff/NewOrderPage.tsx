import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { cx } from '@/shared/colors'
import {
  Alert,
  BackLink,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { IconSearch } from '@/components/icons'
import type { Vehicle } from '@/lib/types'
import { keys } from '@/lib/query-keys'

interface StaffClient {
  id: number
  name: string
  email: string
  phone: string | null
  vehicles: Vehicle[]
}

export function NewOrderPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [clientId, setClientId] = useState<number | null>(null)
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [mileage, setMileage] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const clients = useQuery({
    queryKey: keys.staffClients(search),
    queryFn: () =>
      api.get<{ items: StaffClient[] }>(`/staff/clients?q=${encodeURIComponent(search)}`),
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<{ order: { id: number } }>('/staff/repairs', {
        clientId,
        vehicleId,
        mileage: mileage ? Number(mileage) : undefined,
        clientNote: note.trim() || undefined,
      }),
    onSuccess: (data) => navigate(`/taller/orden/${data.order.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No pudimos crear la orden'),
  })

  const client = clients.data?.items.find((c) => c.id === clientId)
  const step = clientId ? 2 : 1

  return (
    <div className="enter">
      <BackLink to="/taller">Ordenes</BackLink>

      <PageHeader
        eyebrow="Taller"
        title="Nueva orden"
        subtitle="Elige el cliente y el vehiculo que entra hoy."
      />

      {/* Indicador de pasos: el taller ve en que punto esta de un vistazo. */}
      <div className="mb-8 flex items-center gap-3">
        {['Cliente', 'Vehiculo'].map((label, i) => {
          const n = i + 1
          const done = n < step
          const active = n === step
          return (
            <div key={label} className="flex items-center gap-3">
              {i > 0 ? <span className="h-px w-8 bg-line" aria-hidden="true" /> : null}
              <span className="flex items-center gap-2">
                <span
                  className={cx(
                    'flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[11px] font-semibold transition-colors',
                    active && 'border-accent bg-accent text-black',
                    done && 'border-ok/50 bg-ok/10 text-ok',
                    !active && !done && 'border-line text-ink-muted',
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {n}
                </span>
                <span
                  className={cx(
                    'font-mono text-[11px] uppercase tracking-[0.1em]',
                    active ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  {label}
                </span>
              </span>
            </div>
          )
        })}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <div className="rule mb-4">
            <span className="eyebrow">1. Cliente</span>
          </div>

          <SearchInput
            value={search}
            onValueChange={setSearch}
            label="Buscar cliente"
            placeholder="Nombre, correo o telefono"
          />

          <ul className="scroll-slim mt-4 max-h-80 space-y-1 overflow-y-auto">
            {clients.isLoading ? (
              <li className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </li>
            ) : clients.data?.items.length ? (
              clients.data.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setClientId(c.id)
                      setVehicleId(c.vehicles[0]?.id ?? null)
                      setError(null)
                    }}
                    aria-pressed={clientId === c.id}
                    className={cx(
                      'w-full rounded border px-3.5 py-3 text-left transition-colors',
                      clientId === c.id
                        ? 'border-accent bg-accent/[0.07]'
                        : 'border-transparent hover:bg-surface-hover',
                    )}
                  >
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-muted">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </p>
                    {c.vehicles.length ? (
                      <p className="mt-1.5 font-mono text-[11px] text-ink-muted/70">
                        {c.vehicles.map((v) => v.plate).join(' · ')}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="py-12 text-center">
                <IconSearch className="mx-auto mb-3 h-6 w-6 text-ink-muted" />
                <p className="text-sm text-ink-muted">Sin resultados.</p>
                <p className="mt-1 text-[13px] text-ink-muted/70">
                  Prueba con el correo o el telefono del cliente.
                </p>
              </li>
            )}
          </ul>
        </Card>

        <Card>
          <div className="rule mb-4">
            <span className="eyebrow">2. Vehiculo</span>
          </div>

          {!clientId ? (
            <p className="py-6 text-sm text-ink-muted">Elige un cliente primero.</p>
          ) : !client?.vehicles.length ? (
            <p className="py-6 text-sm text-ink-muted">
              Este cliente no tiene vehiculos registrados. Pidele que los anada desde su portal, o
              abre la orden sin uno.
            </p>
          ) : (
            <div className="space-y-4">
              <Field label="Vehiculo">
                {(props) => (
                  <Select
                    {...props}
                    value={vehicleId ?? ''}
                    onChange={(e) => setVehicleId(Number(e.target.value))}
                  >
                    {client.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} — {v.brand} {v.model}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Kilometraje" hint="Opcional, se guarda con la orden.">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    inputMode="numeric"
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value)}
                    placeholder="50000"
                  />
                )}
              </Field>

              <Field label="Lo que dijo el cliente">
                {(props) => (
                  <Textarea
                    {...props}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Hace ruido al frenar..."
                  />
                )}
              </Field>

              {error ? <Alert>{error}</Alert> : null}

              <Button
                className="w-full"
                loading={create.isPending}
                disabled={!vehicleId}
                onClick={() => {
                  setError(null)
                  create.mutate()
                }}
              >
                Abrir orden
              </Button>
              <p className="text-center text-[13px] text-ink-muted">
                La orden empieza en estado <strong className="font-medium text-ink">Recibido</strong>.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}