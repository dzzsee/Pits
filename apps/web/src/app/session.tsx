import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '@/lib/api'
import { useIdleLogout } from '@/lib/use-idle-logout'
import type { Role, User } from '@/lib/types'
import { useRealtime } from '@/lib/use-realtime'

interface SessionValue {
  user: User | null
  status: 'loading' | 'authenticated' | 'anonymous'
  login: (email: string, password: string) => Promise<User>
  register: (input: {
    name: string
    email: string
    password: string
    phone?: string
  }) => Promise<User>
  logout: () => Promise<void>
  setUser: (user: User) => void
  isStaff: boolean
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [status, setStatus] = useState<SessionValue['status']>('loading')

  // Una sola conexion en vivo por sesion, montada mientras haya usuario.
  useRealtime(status === 'authenticated')

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUserState(null)
      setStatus('anonymous')
    })
  }, [])

  useEffect(() => {
    if (!tokenStore.access()) {
      setStatus('anonymous')
      return
    }
    let alive = true
    api
      .get<{ user: User }>('/auth/me')
      .then(({ user: u }) => {
        if (!alive) return
        setUserState(u)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!alive) return
        tokenStore.clear()
        setStatus('anonymous')
      })
    return () => {
      alive = false
    }
  }, [])

  const authenticate = useCallback(
    (data: { user: User; accessToken: string; refreshToken: string }) => {
      tokenStore.set(data.accessToken, data.refreshToken)
      setUserState(data.user)
      setStatus('authenticated')
      return data.user
    },
    [],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<{ user: User; accessToken: string; refreshToken: string }>(
        '/auth/login',
        { email, password },
      )
      return authenticate(data)
    },
    [authenticate],
  )

  const register = useCallback(
    async (input: { name: string; email: string; password: string; phone?: string }) => {
      const data = await api.post<{ user: User; accessToken: string; refreshToken: string }>(
        '/auth/register',
        input,
      )
      return authenticate(data)
    },
    [authenticate],
  )

  /**
   * Cerrar sesion de verdad: revoca la sesion en el servidor y no solo borra
   * los tokens del navegador.
   *
   * Sin la revocacion, "salir" era un forget: el refresh token (30 dias) seguia
   * sirviendo para obtener tokens nuevos.
   */
  const logout = useCallback(async () => {
    const token = tokenStore.access()
    tokenStore.clear()
    setUserState(null)
    setStatus('anonymous')

    if (!token) return
    try {
      await api.post('/auth/logout', { accessToken: token })
    } catch {
      // Si no se puede avisar, la sesion local ya esta cerrada igualmente.
    }
  }, [])

  /**
   * Cierre automatico: 15 minutos sin actividad, o al cerrar la pestana.
   *
   * La deteccion de inactividad es del cliente a proposito. "Inactividad"
   * significa que la persona no esta haciendo nada, no que la pagina este
   * callada: alguien puede veinte minutos leyendo el historial de su carro sin
   * generar ni una peticion, y cerrar su sesion por eso seria incorrecto.
   */
  useIdleLogout(status === 'authenticated', logout)

  // Al cerrar la pestana no hay tiempo para un `fetch` normal: se usa
  // `sendBeacon`, que el navegador entrega aunque la pagina este dying.
  useEffect(() => {
    if (status !== 'authenticated') return

    const beacon = () => {
      const token = tokenStore.access()
      if (!token) return
      navigator.sendBeacon(
        '/api/auth/logout',
        new Blob([JSON.stringify({ accessToken: token })], { type: 'application/json' }),
      )
    }

    window.addEventListener('pagehide', beacon)
    return () => window.removeEventListener('pagehide', beacon)
  }, [status])

  const value = useMemo<SessionValue>(
    () => ({
      user,
      status,
      login,
      register,
      logout,
      setUser: setUserState,
      isStaff: user?.role === 'mechanic' || user?.role === 'admin',
    }),
    [user, status, login, register, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>')
  return ctx
}

/** Redirige segun el rol: el personal va a /taller, el cliente a /. */
export function homeFor(role: Role): string {
  return role === 'client' ? '/' : '/taller'
}
