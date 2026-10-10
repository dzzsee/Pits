import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { homeFor, useSession } from '@/app/session'
import { Alert, Button, Field, Input } from '@/components/ui'
import { AuthShell } from './LoginPage'
import { ApiError } from '@/lib/api'

export function RegisterPage() {
  const { register, user } = useSession()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to={homeFor(user.role)} replace />

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const account = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      })
      // La cuenta creada puede ser de cliente o de taller: el destino lo
      // decide el rol que devuelve el API, no una ruta fija.
      navigate(homeFor(account.role), { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos crear tu cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle="Empieza a ganar puntos con cada reparacion"
      footer={
        <>
          Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-medium text-accent underline underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error ? <Alert>{error}</Alert> : null}

        <Field label="Nombre">
          {(props) => (
            <Input {...props} required value={form.name} onChange={set('name')} placeholder="Tu nombre" />
          )}
        </Field>

        <Field label="Correo">
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
              placeholder="tucorreo@email.com"
            />
          )}
        </Field>

        <Field label="Telefono" hint="Opcional. Nos sirve para avisarte.">
          {(props) => (
            <Input {...props} value={form.phone} onChange={set('phone')} placeholder="+1 809 555 0101" />
          )}
        </Field>

        <Field label="Contrasena" hint="Minimo 8 caracteres.">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
            />
          )}
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Crear cuenta
        </Button>
      </form>
    </AuthShell>
  )
}