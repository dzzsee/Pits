import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '@/app/session'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui'
import { IconLogout } from '@/components/icons'
import { usePush } from '@/lib/use-push'
import { keys } from '@/lib/query-keys'

export function AccountPage() {
  const { user, setUser, logout } = useSession()
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  )

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
      setFeedback({
        tone: 'danger',
        text: err instanceof ApiError ? err.message : 'No pudimos guardar',
      }),
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
    <div className="enter max-w-2xl">
      <PageHeader eyebrow="Tu taller" title="Cuenta" subtitle="Tus datos y notificaciones" />

      <div className="space-y-10">
        {/* Datos */}
        <section>
          <div className="rule mb-4">
            <span className="eyebrow">Datos personales</span>
          </div>
          <Card>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                setFeedback(null)
                saveProfile.mutate()
              }}
            >
              {feedback ? (
                <Alert tone={feedback.tone}>{feedback.text}</Alert>
              ) : null}

              <Field label="Nombre">
                {(props) => (
                  <Input
                    {...props}
                    required
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  />
                )}
              </Field>

              <Field label="Correo" hint="El correo no se puede cambiar.">
                {(props) => <Input {...props} value={user?.email ?? ''} disabled />}
              </Field>

              <Field label="Telefono">
                {(props) => (
                  <Input
                    {...props}
                    value={profile.phone}
                    onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+1 809 555 0101"
                  />
                )}
              </Field>

              <p className="eyebrow">Miembro desde {formatDate(user?.created_at)}</p>

              <Button type="submit" loading={saveProfile.isPending}>
                Guardar cambios
              </Button>
            </form>
          </Card>
        </section>

        {/* Notificaciones */}
        <section>
          <div className="rule mb-4">
            <span className="eyebrow">Notificaciones</span>
          </div>
          <Card>
            <PushSettings
              state={push.state}
              busy={push.busy}
              onSubscribe={() => void push.subscribe()}
            />
          </Card>
        </section>

        {/* Contrasena */}
        <section>
          <div className="rule mb-4">
            <span className="eyebrow">Contrasena</span>
          </div>
          <Card>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                setFeedback(null)
                changePassword.mutate()
              }}
            >
              <Field label="Contrasena actual">
                {(props) => (
                  <Input
                    {...props}
                    type="password"
                    autoComplete="current-password"
                    required
                    value={passwords.currentPassword}
                    onChange={(e) =>
                      setPasswords((p) => ({ ...p, currentPassword: e.target.value }))
                    }
                  />
                )}
              </Field>

              <Field label="Nueva contrasena" hint="Minimo 8 caracteres.">
                {(props) => (
                  <Input
                    {...props}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={passwords.newPassword}
                    onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                  />
                )}
              </Field>

              <Button type="submit" variant="secondary" loading={changePassword.isPending}>
                Actualizar contrasena
              </Button>
            </form>
          </Card>
        </section>

        {/* Sesion */}
        <section>
          <div className="rule mb-4">
            <span className="eyebrow">Sesion</span>
          </div>
          <Card>
            <Button
              variant="danger"
              onClick={logout}
              className="w-full"
              icon={<IconLogout className="h-4 w-4" />}
            >
              Cerrar sesion
            </Button>
            <Link
              to="/entrar"
              className="mt-4 block text-center font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted transition-colors hover:text-accent"
            >
              Cambiar de cuenta
            </Link>
          </Card>
        </section>
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{info.title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{info.body}</p>
      </div>
      {info.action ? (
        <Button size="sm" onClick={onSubscribe} loading={busy}>
          Activar
        </Button>
      ) : null}
    </div>
  )
}