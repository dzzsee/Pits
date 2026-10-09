import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { Alert, Button, Card, EmptyState, Field, Input, SectionHeader, Skeleton, Textarea } from '@/components/ui'
import { PageHeader } from '@/layouts/ClientLayout'
import type { Vehicle } from '@/lib/types'
import { keys } from '@/lib/query-keys'

interface VehiclesResponse {
  items: Vehicle[]
}

const EMPTY = { plate: '', brand: '', model: '', year: '', mileage: '', vin: '', notes: '' }

export function VehiclesPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: keys.vehicles(),
    queryFn: () => api.get<VehiclesResponse>('/me/vehicles'),
  })

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Mis vehiculos"
        subtitle="Ficha y kilometraje de cada carro"
        action={
          !creating && !editing ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              Agregar
            </Button>
          ) : null
        }
      />

      {creating ? (
        <VehicleForm
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false)
            await queryClient.invalidateQueries({ queryKey: keys.vehicles() })
            await queryClient.invalidateQueries({ queryKey: keys.dashboard() })
          }}
        />
      ) : null}

      {editing ? (
        <VehicleForm
          vehicle={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await queryClient.invalidateQueries({ queryKey: keys.vehicles() })
            await queryClient.invalidateQueries({ queryKey: keys.dashboard() })
          }}
        />
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : !data?.items.length ? (
        <Card className="p-0">
          <EmptyState
            title="Sin vehiculos registrados"
            description="Agrega tu carro para que el taller lo associe a tus reparaciones."
            action={<Button size="sm" onClick={() => setCreating(true)}>Agregar vehiculo</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.items.map((v) => (
            <Card key={v.id} className="transition-shadow duration-150 hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[15px] font-semibold tracking-tight">{v.plate}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {v.brand} {v.model}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>
                  Editar
                </Button>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px]">
                <div>
                  <dt className="text-ink-subtle">Anio</dt>
                  <dd className="mt-0.5 font-medium">{v.year ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Kilometraje</dt>
                  <dd className="mt-0.5 font-medium">
                    {v.mileage ? `${v.mileage.toLocaleString('es-DO')} km` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Visitas</dt>
                  <dd className="mt-0.5 font-medium">{v.order_count ?? 0}</dd>
                </div>
                {v.vin ? (
                  <div className="col-span-2">
                    <dt className="text-ink-subtle">VIN</dt>
                    <dd className="mt-0.5 font-mono text-[12px]">{v.vin}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 text-[12px] text-ink-subtle">
                Agregado el {formatDate(v.created_at)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function VehicleForm({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle?: Vehicle
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(
    vehicle
      ? {
          plate: vehicle.plate,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year ? String(vehicle.year) : '',
          mileage: vehicle.mileage ? String(vehicle.mileage) : '',
          vin: vehicle.vin ?? '',
          notes: vehicle.notes ?? '',
        }
      : EMPTY,
  )
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        plate: form.plate.trim().toUpperCase(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: form.year ? Number(form.year) : undefined,
        mileage: form.mileage ? Number(form.mileage) : undefined,
        vin: form.vin.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }
      return vehicle
        ? api.patch<Vehicle>(`/me/vehicles/${vehicle.id}`, payload)
        : api.post<Vehicle>('/me/vehicles', payload)
    },
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No pudimos guardar'),
  })

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <Card className="mb-6 animate-scale-in">
      <SectionHeader title={vehicle ? 'Editar vehiculo' : 'Nuevo vehiculo'} />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          save.mutate()
        }}
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Placa">
            <Input required value={form.plate} onChange={set('plate')} placeholder="ABC-123" />
          </Field>
          <Field label="VIN" hint="Opcional">
            <Input value={form.vin} onChange={set('vin')} placeholder="Numero de chasis" />
          </Field>
          <Field label="Marca">
            <Input required value={form.brand} onChange={set('brand')} placeholder="Toyota" />
          </Field>
          <Field label="Modelo">
            <Input required value={form.model} onChange={set('model')} placeholder="Corolla" />
          </Field>
          <Field label="Anio">
            <Input
              type="number"
              inputMode="numeric"
              value={form.year}
              onChange={set('year')}
              placeholder="2020"
            />
          </Field>
          <Field label="Kilometraje">
            <Input
              type="number"
              inputMode="numeric"
              value={form.mileage}
              onChange={set('mileage')}
              placeholder="50000"
            />
          </Field>
        </div>
        <Field label="Notas">
          <Textarea
            value={form.notes}
            onChange={set('notes')}
            placeholder="Color, detalles, preferencias..."
          />
        </Field>
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  )
}
