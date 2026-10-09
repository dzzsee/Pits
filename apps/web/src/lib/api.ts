const ACCESS_KEY = 'pits.accessToken'
const REFRESH_KEY = 'pits.refreshToken'

/**
 * Safari en modo privado y algunos modo nativos lanzan al tocar localStorage.
 * Sin este guarda, el cliente de API reventaba antes deFetch y la app entera
 * se quedaba en blanco; aqui degrada a sesion en memoria.
 */
function safeStorage(): Storage | null {
  try {
    const probe = '__pits_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

const store = typeof window !== 'undefined' ? safeStorage() : null

export const tokenStore = {
  access: () => store?.getItem(ACCESS_KEY) ?? null,
  refresh: () => store?.getItem(REFRESH_KEY) ?? null,
  set(access: string, refresh: string) {
    store?.setItem(ACCESS_KEY, access)
    store?.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    store?.removeItem(ACCESS_KEY)
    store?.removeItem(REFRESH_KEY)
  },
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE = '/api'

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

let refreshing: Promise<boolean> | null = null

/**
 * Un refresh compartido: si varias peticiones reciben 401 a la vez, todas
 * esperan al mismo intento en vez de disparar N refrescos.
 */
async function refreshSession(): Promise<boolean> {
  const token = tokenStore.refresh()
  if (!token) return false

  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { accessToken: string; refreshToken: string }
      tokenStore.set(data.accessToken, data.refreshToken)
      return true
    } catch {
      return false
    } finally {
      // Se libera en el siguiente tick para que los que esperan lean el resultado.
      queueMicrotask(() => {
        refreshing = null
      })
    }
  })()

  return refreshing
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  retry?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, retry = true } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = tokenStore.access()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Sin conexion con el servidor', 'network_error')
  }

  if (res.status === 401 && auth && retry) {
    const ok = await refreshSession()
    if (ok) return request<T>(path, { ...options, retry: false })
    tokenStore.clear()
    onUnauthorized?.()
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const payload = text ? (JSON.parse(text) as unknown) : null

  if (!res.ok) {
    const err = (payload as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error
    throw new ApiError(
      res.status,
      err?.message ?? 'Algo salio mal. Intenta de nuevo.',
      err?.code,
      err?.details as { path: string; message: string }[] | undefined,
    )
  }

  return payload as T
}

export const api = {
  get: <T,>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
}

/** Descarga un CSV autenticado: fetch + blob para no perder el token. */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = tokenStore.access()
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new ApiError(res.status, 'No se pudo generar el archivo')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
