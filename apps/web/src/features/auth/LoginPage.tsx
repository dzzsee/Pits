import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { homeFor, useSession } from '@/app/session'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Logo } from '@/components/Logo'
import { ApiError } from '@/lib/api'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-10 w-10" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        {children}
        <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>
      </div>
    </div>
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
          <Link to="/registro" className="font-medium text-ink underline underline-offset-4">
            Crear una
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Correo">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@email.com"
          />
        </Field>
        <Field label="Contrasena">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>

    </AuthShell>
  )
}