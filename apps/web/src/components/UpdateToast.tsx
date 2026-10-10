import { useState } from 'react'
import { useServiceWorker } from '@/lib/use-sw'
import { Button } from '@/components/ui'

/**
 * Aviso de version nueva.
 *
 * El boton desregistra el service worker y borra las caches antes de recargar.
 * Un `reload` a secas no basta: el worker antiguo sigue controlando la pagina
 * y devuelve su HTML precacheado, con los hashes de assets de aquel momento.
 */
export function UpdateToast() {
  const { prompt, applyUpdate } = useServiceWorker()
  const [working, setWorking] = useState(false)

  if (prompt !== 'update') return null

  return (
    <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm animate-slide-up rounded-lg border border-accent/40 bg-surface/95 p-4 shadow-panel backdrop-blur-xl lg:bottom-6 lg:left-6 lg:right-auto lg:mx-0">
      <p className="text-[13px] font-medium">Hay una version nueva disponible.</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
        Al actualizar se borra la cache del navegador para cargar el bundle recien desplegado.
      </p>
      <Button
        size="sm"
        className="mt-4 w-full"
        loading={working}
        onClick={() => {
          setWorking(true)
          void applyUpdate()
        }}
      >
        {working ? 'Actualizando' : 'Actualizar ahora'}
      </Button>
    </div>
  )
}