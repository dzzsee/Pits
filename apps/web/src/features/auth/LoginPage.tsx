import type { FormEvent, ReactNode } from 'react'
import { useId, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { homeFor, useSession } from '@/app/session'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Logo } from '@/components/Logo'
import { IconEye, IconLock } from '@/components/icons'
import { ApiError } from '@/lib/api'
import { consumeIdleExpired } from '@/lib/use-idle-logout'

/**
 * Marco de las pantallas de acceso.
 *
 * A pantalla partida: la izquierda lleva la marca y la promesa, la derecha el
 * formulario. Antes era un formulario centrado sobre el fondo plano, que es
 * la composicion mas anonima posible para la primera pantalla que ve alguien.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Lado de marca. La retícula del body hace de textura de fondo. */}
      <div className="relative hidden flex-1 flex-col justify-between border-r border-line px-14 py-14 lg:flex">
        <div className="flex items-center gap-3">
          <Logo className="h-9 w-9" />
          <span className="font-display text-2xl uppercase tracking-[0.08em]">Pits</span>
        </div>

        <div className="max-w-md">
          <h1 className="font-display text-[clamp(3.5rem,7vw,5.5rem)] uppercase leading-[0.88] tracking-[0.01em]">
            Tu carro
            <br />
            en buenas
            <br />
            <span className="text-accent">manos</span>
          </h1>
          <p className="mt-6 text-ink-muted">
            Sigue cada paso de la reparacion y gana puntos por cada visita. Sin llamadas, sin
            esperas.
          </p>
        </div>

        <p className="eyebrow">Servicio de taller</p>
      </div>

      {/* Lado del formulario. */}
      <div className="flex flex-1 flex-col justify-center px-8 py-14 sm:px-12 lg:px-16">
        <div className="enter mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="h-10 w-10" />
          </div>

          <h2 className="font-display text-3xl uppercase leading-none tracking-[0.02em]">{title}</h2>
          <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-muted">
            {footer}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Campo de contrasena con alternar visibilidad. Escribes la clave del taller
 * en un movil, a veces delante de gente: tenerla en texto plano a proposito no
 * ayuda a nadie.
 */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  autoComplete: string
  placeholder?: string
  error?: string
}) {
  const [visible, setVisible] = useState(false)
  const id = useId()

  return (
    <Field label={label} error={error}>
      {(props) => (
        <div className="relative">
          <input
            {...props}
            id={id}
            type={visible ? 'text' : 'password'}
            autoComplete={autoComplete}
            required
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="field pr-11"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink"
          >
            {visible ? <IconLock className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
          </button>
        </div>
      )}
    </Field>
  )
}

export function LoginPage() {
  const { login, user } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // La sesion se cerro sola por inactividad: decirlo evita que el usuario
  // piense que la app fallo.
  const [idleClosed] = useState(consumeIdleExpired)

  if (user) return <Navigate to={homeFor(user.role)} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const account = await login(email.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/entrar' ? from : homeFor(account.role), { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Entra a Pits"
      subtitle="Sigue tu reparacion en tiempo real"
      footer={
        <>
          Todavia no tienes cuenta?{' '}
          <Link to="/registro" className="font-medium text-accent underline underline-offset-4">
            Crear una
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {idleClosed ? (
          <Alert tone="info">
            Tu sesion se cerro por inactividad. Vuelve a entrar para continuar.
          </Alert>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}

        <Field label="Correo">
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@email.com"
            />
          )}
        </Field>

        <PasswordField
          label="Contrasena"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>
    </AuthShell>
  )
}