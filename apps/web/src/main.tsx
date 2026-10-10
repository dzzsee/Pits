import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { SessionProvider } from '@/app/session'
import { App } from '@/app/App'
import { ApiError } from '@/lib/api'
import { keys } from '@/lib/query-keys'

// Las tres familias del sistema, en woff2 y declaradas en `fonts.css`.
import '@/fonts.css'
import '@/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // 4xx no se reintentan: son errores de negocio, no de red.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 2
      },
    },
  },
})

/**
 * Vistas vivas: el estado de una reparacion y el panel del cliente cambian
 * mientras el usuario las mira, asi que se mantienen frescas por defecto. El
 * resto (ajustes, reportes, listas de administracion) puede esperar.
 */
for (const liveKey of [keys.repair(0), keys.dashboard(), keys.staffRepairs(), keys.loyalty()]) {
  queryClient.setQueryDefaults(liveKey, { staleTime: 5_000 })
}

/**
 * Version cargada, visible en la consola.
 *
 * Cuando una pantalla no cuadra, la primera pregunta es si el navegador esta
 * sirviendo un bundle antiguo por el service worker. El nombre del fichero
 * lleva el hash de contenido, asi que basta con comparar lo que dice esta
 * linea con lo que hay desplegado.
 */
console.info(
  `[pits] build ${import.meta.env.VITE_BUILD ?? 'dev'} · modo ${import.meta.env.MODE} · service worker ${
    'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'activo' : 'sin control'
  }`,
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
