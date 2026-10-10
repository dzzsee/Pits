import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { IconCarFront, IconEdit, IconPlus } from '@/components/icons'
import type { Vehicle } from '@/lib/types'
import { keys } from '@/lib/query-keys'

interface VehiclesResponse {
  items: Vehicle[]
}

const EMPTY = { plate: '', brand: '', model: '', year: '', mileage: '', vin: '', notes: '' }

export function VehiclesPage() {
  const queryClient = useQueryClient()
  /** `null` cerrado; un objeto abre el dialogo, con `vehicle` si es edicion. */
  const [form, setForm] = useState<{ vehicle?: Vehicle } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: keys.vehicles(),
    queryFn: () => api.get<VehiclesResponse>('/me/vehicles'),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.vehicles() })
    await queryClient.invalidateQueries({ queryKey: keys.dashboard() })
  }

  return (
    <div className="enter">
      <PageHeader
        eyebrow="Tu taller"
        title="Mis vehiculos"
        subtitle="Ficha y kilometraje de cada carro"
        action={
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setForm({})}>
            Agregar
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : !data?.items.length ? (
        <Card className="p-0">
          <EmptyState
            icon={<IconCarFront className="h-14 w-14" />}
            title="Sin vehiculos registrados"
            description="Agrega tu carro para que el taller lo asocie a tus reparaciones."
            action={
              <Button icon={<IconPlus className="h-4 w-4" />} onClick={() => setForm({})}>
                Agregar vehiculo
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.items.map((v) => (
            <VehicleCard key={v.id} vehicle={v} onEdit={() => setForm({ vehicle: v })} />
          ))}
        </div>
      )}

      {form ? (
        <VehicleForm
          vehicle={form.vehicle}
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function VehicleCard({ vehicle, onEdit }: { vehicle: Vehicle; onEdit: () => void }) {
  return (
    <Card className="card-hover group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* La placa en mono grande: es lo que identifica el carro de un
              vistazo, igual que en la calle. */}
          <p className="font-mono text-xl font-semibold tracking-[0.12em]">{vehicle.plate}</p>
          <p className="mt-1.5 text-sm text-ink-muted">
            {vehicle.brand} {vehicle.model}
            {vehicle.year ? ` · ${vehicle.year}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${vehicle.plate}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink-muted opacity-0 transition-all duration-300 hover:bg-surface-hover hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
        >
          <IconEdit className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
        <div>
          <dt className="eyebrow">Kilometraje</dt>
          <dd className="mt-1.5 text-sm tabular-nums">
            {vehicle.mileage ? `${vehicle.mileage.toLocaleString('es-DO')} km` : '—'}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Visitas</dt>
          <dd className="mt-1.5 text-sm tabular-nums">{vehicle.order_count ?? 0}</dd>
        </div>
        {vehicle.vin ? (
          <div className="col-span-2">
            <dt className="eyebrow">VIN</dt>
            <dd className="mt-1.5 font-mono text-xs">{vehicle.vin}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-4 font-mono text-[11px] text-ink-muted/70">
        Agregado el {formatDate(vehicle.created_at)}
      </p>
    </Card>
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
  const [values, setValues] = useState(
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
        plate: values.plate.trim().toUpperCase(),
        brand: values.brand.trim(),
        model: values.model.trim(),
        year: values.year ? Number(values.year) : undefined,
        mileage: values.mileage ? Number(values.mileage) : undefined,
        vin: values.vin.trim() || undefined,
        notes: values.notes.trim() || undefined,
      }
      return vehicle
        ? api.patch<Vehicle>(`/me/vehicles/${vehicle.id}`, payload)
        : api.post<Vehicle>('/me/vehicles', payload)
    },
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No pudimos guardar'),
  })

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  return (
    <Dialog
      open
      onClose={onClose}
      title={vehicle ? 'Editar vehiculo' : 'Nuevo vehiculo'}
      description="Los datos del carro que el taller usa para identificarlo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setError(null)
              save.mutate()
            }}
            loading={save.isPending}
          >
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          save.mutate()
        }}
      >
        {error ? <Alert>{error}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Placa">
            {(props) => (
              <Input
                {...props}
                required
                className="font-mono uppercase tracking-[0.08em]"
                value={values.plate}
                onChange={set('plate')}
                placeholder="ABC-123"
              />
            )}
          </Field>

          <Field label="VIN" hint="Opcional">
            {(props) => (
              <Input
                {...props}
                className="font-mono text-sm"
                value={values.vin}
                onChange={set('vin')}
                placeholder="Numero de chasis"
              />
            )}
          </Field>

          <Field label="Marca">
            {(props) => (
              <Input {...props} required value={values.brand} onChange={set('brand')} placeholder="Toyota" />
            )}
          </Field>

          <Field label="Modelo">
            {(props) => (
              <Input {...props} required value={values.model} onChange={set('model')} placeholder="Corolla" />
            )}
          </Field>

          <Field label="Anio">
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                value={values.year}
                onChange={set('year')}
                placeholder="2020"
              />
            )}
          </Field>

          <Field label="Kilometraje">
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                value={values.mileage}
                onChange={set('mileage')}
                placeholder="50000"
              />
            )}
          </Field>
        </div>

        <Field label="Notas">
          {(props) => (
            <Textarea
              {...props}
              value={values.notes}
              onChange={set('notes')}
              placeholder="Color, detalles, preferencias..."
            />
          )}
        </Field>

        {/* Boton de submit real: sin esto, pulsar Enter en un campo no guarda
            aunque el boton de abajo exista. */}
        <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1}>
          Guardar
        </button>
      </form>
    </Dialog>
  )
}