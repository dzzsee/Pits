import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionHeader,
  Select,
  Skeleton,
} from '@/components/ui'
import type { Role, User } from '@/lib/types'
import { keys } from '@/lib/query-keys'

interface LoyaltyConfig {
  pointsPerRepair: number
  pointsPerReward: number
  rewardLabel: string
  rewardValidDays: number
}

const ROLE_LABEL: Record<Role, string> = {
  client: 'Cliente',
  mechanic: 'Mecanico',
  admin: 'Administrador',
}

export function AdminPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ role: 'mechanic', name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState<string | null>(null)

  const users = useQuery({
    queryKey: keys.adminUsers(),
    queryFn: () => api.get<{ items: User[] }>('/admin/users'),
  })

  const config = useQuery({
    queryKey: keys.loyaltySettings(),
    queryFn: () => api.get<LoyaltyConfig>('/admin/loyalty-settings'),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.adminUsers() })
    await queryClient.invalidateQueries({ queryKey: keys.loyaltySettings() })
  }

  const create = useMutation({
    mutationFn: () => api.post<User>('/admin/users', { ...form, role: form.role as Role }),
    onSuccess: async () => {
      setForm({ role: 'mechanic', name: '', email: '', phone: '', password: '' })
      await refresh()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No pudimos crear el usuario'),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/admin/users/${id}`, { isActive }),
    onSuccess: refresh,
  })

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const staff = users.data?.items.filter((u) => u.role !== 'client') ?? []
  const clients = users.data?.items.filter((u) => u.role === 'client') ?? []

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
        <p className="mt-1 text-sm text-ink-muted">Usuarios del taller y reglas del programa.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <SectionHeader title="Agregar personal" />
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                setError(null)
                create.mutate()
              }}
            >
              {error ? <Alert>{error}</Alert> : null}
              <Field label="Rol">
                <Select value={form.role} onChange={set('role')}>
                  <option value="mechanic">Mecanico</option>
                  <option value="admin">Administrador</option>
                  <option value="client">Cliente</option>
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input required value={form.name} onChange={set('name')} />
                </Field>
                <Field label="Correo">
                  <Input type="email" required value={form.email} onChange={set('email')} />
                </Field>
                <Field label="Telefono" hint="Opcional">
                  <Input value={form.phone} onChange={set('phone')} />
                </Field>
                <Field label="Contrasena">
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={set('password')}
                  />
                </Field>
              </div>
              <Button type="submit" loading={create.isPending}>
                Crear usuario
              </Button>
            </form>
          </Card>

          <LoyaltySettingsCard config={config.data} onSaved={refresh} />
        </div>

        <div className="space-y-5">
          <div>
            <SectionHeader title={`Personal (${staff.length})`} />
            {users.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {staff.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onToggle={() => toggleActive.mutate({ id: u.id, isActive: false })}
                    />
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div>
            <SectionHeader title={`Clientes (${clients.length})`} />
            {users.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {clients.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onToggle={() => toggleActive.mutate({ id: u.id, isActive: false })}
                    />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function UserRow({ user, onToggle }: { user: User; onToggle: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium">{user.name}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-subtle">{user.email}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={user.role === 'admin' ? 'info' : 'neutral'}>{ROLE_LABEL[user.role]}</Badge>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          Desactivar
        </Button>
      </div>
    </li>
  )
}

function LoyaltySettingsCard({
  config,
  onSaved,
}: {
  config: LoyaltyConfig | undefined
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState<LoyaltyConfig | null>(null)
  const value = draft ?? config
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (v: LoyaltyConfig) => api.patch<LoyaltyConfig>('/admin/loyalty-settings', v),
    onSuccess: async (data) => {
      setDraft(data)
      await onSaved()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'No pudimos guardar'),
  })

  if (!value) return <Card><Skeleton className="h-52 w-full" /></Card>

  const set = (key: keyof LoyaltyConfig, v: string | number) =>
    setDraft({ ...value, [key]: typeof value[key] === 'number' ? Number(v) : String(v) })

  return (
    <Card>
      <SectionHeader
        title="Regla de fidelizacion"
        description="Sin catalogo: una recompensa fija por cada X puntos."
      />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          save.mutate(value)
        }}
      >
        {error ? <Alert>{error}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Puntos por reparacion">
            <Input
              type="number"
              min="0"
              value={value.pointsPerRepair}
              onChange={(e) => set('pointsPerRepair', e.target.value)}
            />
          </Field>
          <Field label="Puntos por recompensa">
            <Input
              type="number"
              min="1"
              value={value.pointsPerReward}
              onChange={(e) => set('pointsPerReward', e.target.value)}
            />
          </Field>
          <Field label="Nombre de la recompensa">
            <Input
              value={value.rewardLabel}
              onChange={(e) => set('rewardLabel', e.target.value)}
            />
          </Field>
          <Field label="Valida por (dias)">
            <Input
              type="number"
              min="1"
              value={value.rewardValidDays}
              onChange={(e) => set('rewardValidDays', e.target.value)}
            />
          </Field>
        </div>

        <p className="rounded-xl bg-surface-sunken px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-muted">
          Cada reparacion entregada da <strong>{value.pointsPerRepair} puntos</strong>. Al llegar a{' '}
          <strong>{value.pointsPerReward}</strong> el cliente gana un{' '}
          <strong>{value.rewardLabel.toLowerCase()}</strong>.
        </p>

        <Button type="submit" loading={save.isPending} variant="secondary">
          Guardar reglas
        </Button>
      </form>
    </Card>
  )
}
