import { useCallback, useEffect, useState } from 'react'

type Prompt = 'idle' | 'installed' | 'update'

/**
 * Registro manual del service worker: el SW cachea el shell pero nunca
 * toma el control de forma automatica, para no cambiar la app bajo los pies
 * del usuario a media sesion.
 */
export function useServiceWorker() {
  const [prompt, setPrompt] = useState<Prompt>('idle')
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (import.meta.env.DEV) return

    let reg: ServiceWorkerRegistration | undefined
    let cancelled = false

    const onUpdate = (sw: ServiceWorker) => {
      if (cancelled) return
      if (navigator.serviceWorker.controller) {
        setPrompt('update')
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) setPrompt('update')
        })
      }
    }

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((r) => {
        reg = r
        if (cancelled) return
        if (r.waiting) setPrompt('update')
        r.addEventListener('updatefound', () => {
          if (r.installing) onUpdate(r.installing)
        })
        // Un SW recien instalado no controla la pagina hasta el siguiente load.
        if (!navigator.serviceWorker.controller) {
          navigator.serviceWorker.addEventListener('controllerchange', () => setOfflineReady(true), {
            once: true,
          })
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      void reg
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    await reg?.waiting?.postMessage('SKIP_WAITING')
    window.location.reload()
  }, [])

  return { prompt, applyUpdate, offlineReady }
}
