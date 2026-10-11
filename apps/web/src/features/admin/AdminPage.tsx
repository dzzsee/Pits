import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useSession } from '@/app/session'
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmButton,
  Field,
  Input,
  PageHeader,
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
  const { user: currentUser } = useSession()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    role: 'mechanic',
    name: '',
    email: '',
    phone: '',
    password: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [toggleFeedback, setToggleFeedback] = useState<{ text: string; ok: boolean } | null>(null)

  // El aviso se retira solo: es confirmacion de una accion puntual, no un estado.
  useEffect(() => {
    if (!toggleFeedback) return
    const timer = window.setTimeout(() => setToggleFeedback(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toggleFeedback])

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
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No pudimos crear el usuario'),
  })

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/admin/users/${id}`, { isActive }),
    onSuccess: async (_data, { isActive }) => {
      setToggleFeedback({ text: isActive ? 'Cuenta reactivada' : 'Cuenta desactivada', ok: true })
      await refresh()
    },
    // Sin esto el fallo era silencioso: el panel no cambiaba y no habia forma
    // de saber si era un error o que la accion no llego a dispararse.
    onError: (err) =>
      setToggleFeedback({
        text: err instanceof ApiError ? err.message : 'No pudimos cambiar el estado de la cuenta',
        ok: false,
      }),
  })

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const all = users.data?.items ?? []
  const staff = all.filter((u) => u.role !== 'client')
  const clients = all.filter((u) => u.role === 'client')
  const currentUserId = currentUser?.id ?? null

  return (
    <div className="enter">
      <PageHeader
        eyebrow="Administracion"
        title="Equipo"
        subtitle="Usuarios del taller y reglas del programa."
      />

      {toggleFeedback ? (
        <div className="mb-6">
          <Alert tone={toggleFeedback.ok ? 'success' : 'danger'}>{toggleFeedback.text}</Alert>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <section>
            <div className="rule mb-4">
              <span className="eyebrow">Agregar personal</span>
            </div>
            <Card>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  setError(null)
                  create.mutate()
                }}
              >
                {error ? <Alert>{error}</Alert> : null}

                <Field label="Rol">
                  {(props) => (
                    <Select {...props} value={form.role} onChange={set('role')}>
                      <option value="mechanic">Mecanico</option>
                      <option value="admin">Administrador</option>
                      <option value="client">Cliente</option>
                    </Select>
                  )}
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nombre">
                    {(props) => <Input {...props} required value={form.name} onChange={set('name')} />}
                  </Field>
                  <Field label="Correo">
                    {(props) => (
                      <Input {...props} type="email" required value={form.email} onChange={set('email')} />
                    )}
                  </Field>
                  <Field label="Telefono" hint="Opcional">
                    {(props) => <Input {...props} value={form.phone} onChange={set('phone')} />}
                  </Field>
                  <Field label="Contrasena">
                    {(props) => (
                      <Input
                        {...props}
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={set('password')}
                      />
                    )}
                  </Field>
                </div>

                <Button type="submit" loading={create.isPending}>
                  Crear usuario
                </Button>
              </form>
            </Card>
          </section>

          <LoyaltySettingsCard config={config.data} onSaved={refresh} />
        </div>

        <div className="space-y-10">
          <UserList
            title="Personal"
            users={staff}
            loading={users.isLoading}
            currentUserId={currentUserId}
            onSetActive={(u, active) => setActive.mutate({ id: u.id, isActive: active })}
          />
          <UserList
            title="Clientes"
            users={clients}
            loading={users.isLoading}
            currentUserId={currentUserId}
            onSetActive={(u, active) => setActive.mutate({ id: u.id, isActive: active })}
          />
        </div>
      </div>
    </div>
  )
}

function UserList({
  title,
  users,
  loading,
  currentUserId,
  onSetActive,
}: {
  title: string
  users: User[]
  loading: boolean
  currentUserId: number | null
  onSetActive: (user: User, isActive: boolean) => void
}) {
  return (
    <section>
      <div className="rule mb-4">
        <span className="eyebrow">{title}</span>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">{users.length}</span>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : users.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <UserRow key={u.id} user={u} currentUserId={currentUserId} onSetActive={onSetActive} />
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-0">
          <p className="px-6 py-10 text-center text-sm text-ink-muted">Sin {title.toLowerCase()}.</p>
        </Card>
      )}
    </section>
  )
}

function UserRow({
  user,
  onSetActive,
  currentUserId,
}: {
  user: User
  onSetActive: (user: User, isActive: boolean) => void
  currentUserId: number | null
}) {
  // El API lo envia siempre. Antes no llegaba y el panel no podía distinguir
  // una cuenta desactivada de una activa.
  const active = user.is_active !== 0
  // Desactivarse a uno mismo deja al panel sin ningun admin con sesion: el
  // siguiente que entre no puede deshacerlo.
  const isSelf = user.id === currentUserId

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {user.name}
          {isSelf ? (
            <span className="eyebrow shrink-0">Tu</span>
          ) : null}
        </p>
        <p className="mt-1 truncate font-mono text-[11px] text-ink-muted">{user.email}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={user.role === 'admin' ? 'accent' : 'neutral'}>{ROLE_LABEL[user.role]}</Badge>
        {!active ? <Badge tone="danger">Inactivo</Badge> : null}

        {isSelf ? (
          <span className="eyebrow px-2">No puedes desactivarte</span>
        ) : active ? (
          <ConfirmButton
            label="Desactivar"
            confirmLabel="Confirmar"
            onConfirm={() => onSetActive(user, false)}
          />
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onSetActive(user, true)}>
            Reactivar
          </Button>
        )}
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

  if (!value) {
    return (
      <Card>
        <Skeleton className="h-52 w-full" />
      </Card>
    )
  }

  const set = (key: keyof LoyaltyConfig, v: string) =>
    setDraft({ ...value, [key]: typeof value[key] === 'number' ? Number(v) : String(v) })

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(config)

  return (
    <section>
      <div className="rule mb-4">
        <span className="eyebrow">Regla de fidelizacion</span>
      </div>
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            save.mutate(value)
          }}
        >
          {error ? <Alert>{error}</Alert> : null}

          {/* Magnitudes, no texto: los numeros van alineados a la derecha y
              en tabular para que las cifras se comparen de un vistazo. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Puntos por reparacion">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min="0"
                  className="text-right tabular-nums"
                  value={value.pointsPerRepair}
                  onChange={(e) => set('pointsPerRepair', e.target.value)}
                />
              )}
            </Field>

            <Field label="Puntos por recompensa">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min="1"
                  className="text-right tabular-nums"
                  value={value.pointsPerReward}
                  onChange={(e) => set('pointsPerReward', e.target.value)}
                />
              )}
            </Field>

            <Field label="Nombre de la recompensa">
              {(props) => (
                <Input
                  {...props}
                  value={value.rewardLabel}
                  onChange={(e) => set('rewardLabel', e.target.value)}
                />
              )}
            </Field>

            <Field label="Valida por (dias)">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min="1"
                  className="text-right tabular-nums"
                  value={value.rewardValidDays}
                  onChange={(e) => set('rewardValidDays', e.target.value)}
                />
              )}
            </Field>
          </div>

          <p className="rounded border border-line bg-surface-hover px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
            Cada reparacion entregada da{' '}
            <strong className="font-medium tabular-nums text-ink">{value.pointsPerRepair}</strong>{' '}
            puntos. Al llegar a{' '}
            <strong className="font-medium tabular-nums text-ink">{value.pointsPerReward}</strong> el
            cliente gana un{' '}
            <strong className="font-medium text-ink">{value.rewardLabel.toLowerCase()}</strong>.
          </p>

          <Button type="submit" loading={save.isPending} variant="secondary" disabled={!dirty}>
            Guardar reglas
          </Button>
        </form>
      </Card>
    </section>
  )
}