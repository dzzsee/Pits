import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '@/lib/api'
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
  logout: () => void
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

  const logout = useCallback(() => {
    tokenStore.clear()
    setUserState(null)
    setStatus('anonymous')
  }, [])

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
