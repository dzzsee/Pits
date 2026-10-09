import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '@/app/session'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { Alert, Button, Card, Field, Input, SectionHeader } from '@/components/ui'
import { PageHeader } from '@/layouts/ClientLayout'
import { usePush } from '@/lib/use-push'
import { keys } from '@/lib/query-keys'

export function AccountPage() {
  const { user, setUser, logout } = useSession()
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const saveProfile = useMutation({
    mutationFn: () =>
      api.patch<{ user: typeof user }>('/auth/me', {
        name: profile.name.trim(),
        phone: profile.phone.trim() || null,
      }),
    onSuccess: async ({ user: u }) => {
      if (u) setUser(u)
      setFeedback({ tone: 'success', text: 'Datos actualizados' })
      await queryClient.invalidateQueries({ queryKey: keys.dashboard() })
    },
    onError: (err) =>
      setFeedback({ tone: 'danger', text: err instanceof ApiError ? err.message : 'No pudimos guardar' }),
  })

  const changePassword = useMutation({
    mutationFn: () => api.post('/auth/me/password', passwords),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '' })
      setFeedback({ tone: 'success', text: 'Contrasena actualizada' })
    },
    onError: (err) =>
      setFeedback({
        tone: 'danger',
        text: err instanceof ApiError ? err.message : 'No pudimos cambiar la contrasena',
      }),
  })

  const push = usePush()

  return (
    <div className="animate-fade-in">
      <PageHeader title="Cuenta" subtitle="Tus datos y notificaciones" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeader title="Datos personales" />
          <Card>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                setFeedback(null)
                saveProfile.mutate()
              }}
            >
              {feedback?.tone === 'danger' ? <Alert>{feedback.text}</Alert> : null}
              {feedback?.tone === 'success' ? <Alert tone="success">{feedback.text}</Alert> : null}

              <Field label="Nombre">
                <Input
                  required
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                />
              </Field>
              <Field label="Correo" hint="El correo no se puede cambiar.">
                <Input value={user?.email ?? ''} disabled />
              </Field>
              <Field label="Telefono">
                <Input
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+1 809 555 0101"
                />
              </Field>
              <p className="text-[12px] text-ink-subtle">
                Miembro desde {formatDate(user?.created_at)}
              </p>
              <Button type="submit" loading={saveProfile.isPending}>
                Guardar cambios
              </Button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <div>
            <SectionHeader title="Notificaciones" />
            <Card>
              <PushSettings
                state={push.state}
                busy={push.busy}
                onSubscribe={() => void push.subscribe()}
              />
            </Card>
          </div>

          <div>
            <SectionHeader title="Contrasena" />
            <Card>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  setFeedback(null)
                  changePassword.mutate()
                }}
              >
                <Field label="Contrasena actual">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={passwords.currentPassword}
                    onChange={(e) =>
                      setPasswords((p) => ({ ...p, currentPassword: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Nueva contrasena" hint="Minimo 8 caracteres.">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={passwords.newPassword}
                    onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                  />
                </Field>
                <Button type="submit" variant="secondary" loading={changePassword.isPending}>
                  Actualizar contrasena
                </Button>
              </form>
            </Card>
          </div>

          <div>
            <SectionHeader title="Sesion" />
            <Card>
              <Button variant="danger" onClick={logout} className="w-full">
                Cerrar sesion
              </Button>
              <Link
                to="/entrar"
                className="mt-3 block text-center text-[13px] text-ink-muted hover:text-ink"
              >
                Cambiar de cuenta
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function PushSettings({
  state,
  busy,
  onSubscribe,
}: {
  state: ReturnType<typeof usePush>['state']
  busy: boolean
  onSubscribe: () => void
}) {
  const copy: Record<typeof state, { title: string; body: string; action?: boolean }> = {
    subscribed: {
      title: 'Notificaciones activadas',
      body: 'Te avisamos por push cuando tu reparacion cambie de estado.',
    },
    granted: {
      title: 'Permiso concedido',
      body: 'Pulsa activar para completar la configuracion.',
      action: true,
    },
    default: {
      title: 'Notificaciones desactivadas',
      body: 'Activalas para saber al instante cuando tu vehiculo este listo.',
      action: true,
    },
    denied: {
      title: 'Notificaciones bloqueadas',
      body: 'Habilitalas desde los ajustes del navegador para este sitio.',
    },
    unsupported: {
      title: 'No disponible',
      body: 'Este navegador no soporta notificaciones push. Te avisaremos dentro de la app.',
    },
    disabled: {
      title: 'No disponible todavia',
      body: 'Las notificaciones se muestran dentro de la app mientras tanto.',
    },
  }

  const info = copy[state]

  return (
    <div>
      <p className="text-[15px] font-medium">{info.title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{info.body}</p>
      {info.action ? (
        <Button size="sm" className="mt-3" onClick={onSubscribe} loading={busy}>
          Activar
        </Button>
      ) : null}
    </div>
  )
}
