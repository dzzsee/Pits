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
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => setOfflineReady(true),
            {
              once: true,
            },
          )
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      void reg
    }
  }, [])

  /**
   * Salir del estado cacheado.
   *
   * Antes solo avisaba al service worker en espera y recargaba. No funcionaba:
   * la recarga ocurre antes de que el worker nuevo tome control, asi que el
   * navegador vuelve a pedirle el HTML al antiguo y sigue viendo lo mismo.
   *
   * Ahora se desregistra todo, se borran las cachés y se espera un frame a que
   * la pagina quede sin service worker. Es la unica forma de romper de raiz un
   * worker que ya tiene el HTML antiguo precacheado.
   */
  const applyUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      window.location.reload()
      return
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister()))

      if ('caches' in window) {
        const keys = await window.caches.keys()
        await Promise.all(keys.map((key) => window.caches.delete(key)))
      }
    } catch {
      /* sin permisos o sin cache: la recarga siguiente basta */
    }

    // Un frame para que el navegador procese el desregistro antes de recargar.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    window.location.reload()
  }, [])

  return { prompt, applyUpdate, offlineReady }
}
