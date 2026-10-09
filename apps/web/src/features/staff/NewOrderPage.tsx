import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { Alert, Button, Card, Field, Input, Select, Skeleton, Textarea } from '@/components/ui'
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
    queryFn: () => api.get<{ items: StaffClient[] }>(`/staff/clients?q=${encodeURIComponent(search)}`),
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

  return (
    <div className="animate-fade-in">
      <Link
        to="/taller"
        className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Ordenes
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Nueva orden</h1>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-[15px] font-semibold tracking-tight">1. Cliente</h2>
          <div className="mt-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, correo o telefono"
              aria-label="Buscar cliente"
            />
          </div>

          <ul className="scroll-slim mt-3 max-h-72 space-y-1 overflow-y-auto">
            {clients.isLoading ? (
              <li className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
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
                    className={`w-full rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                      clientId === c.id ? 'bg-surface-sunken ring-1 ring-line' : 'hover:bg-surface-sunken/60'
                    }`}
                  >
                    <p className="text-[14px] font-medium">{c.name}</p>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </p>
                  </button>
                </li>
              ))
            ) : (
              <li className="py-8 text-center text-sm text-ink-subtle">Sin resultados.</li>
            )}
          </ul>
        </Card>

        <Card>
          <h2 className="text-[15px] font-semibold tracking-tight">2. Vehiculo</h2>

          {!clientId ? (
            <p className="mt-3 text-[13px] text-ink-subtle">Elige un cliente primero.</p>
          ) : !client?.vehicles.length ? (
            <p className="mt-3 text-[13px] text-ink-subtle">
              Este cliente no tiene vehiculos registrados.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <Field label="Vehiculo">
                <Select
                  value={vehicleId ?? ''}
                  onChange={(e) => setVehicleId(Number(e.target.value))}
                >
                  {client.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.brand} {v.model}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Kilometraje" hint="Opcional, se guarda con la orden.">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  placeholder="50000"
                />
              </Field>

              <Field label="Lo que dijo el cliente">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Hace ruido al frenar..."
                />
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
              <p className="text-center text-[12px] text-ink-subtle">
                La orden empieza en estado <strong>Recibido</strong>.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
