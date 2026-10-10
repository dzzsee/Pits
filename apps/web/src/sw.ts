/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()

/**
 * Las navegaciones van SIEMPRE a la red primero.
 *
 * Se registra antes que el precache a proposito: Workbox evalua las rutas en
 * orden, y el precache serviria el `index.html` capturado en el despliegue
 * anterior. Como ese HTML apunta a los `assets/index-<hash>.*` de entonces,
 * un F5 cargaria el bundle viejo y los cambios de estilo no se verian nunca
 * hasta que el service worker se actualizara a mano.
 *
 * El HTML es pequeno y ya llega con `max-age=0`: buscarlo en la red no
 * penaliza, y a cambio un despliegue es visible en la siguiente recarga.
 */
registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({ cacheName: 'pits-html' }))

/**
 * Scripts y estilos por `CacheFirst`: los nombres llevan hash de contenido, asi
 * que un despliegue nuevo produce ficheros nuevos y la cache nunca puede
 * servir una version desfasada de uno mismo.
 */
registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new CacheFirst({
    cacheName: 'pits-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 40 })],
  }),
)

precacheAndRoute(self.__WB_MANIFEST)

// El API nunca se cachea: el estado de una reparacion cambia en segundos.
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api') && request.method === 'GET',
  new NetworkFirst({ cacheName: 'pits-api', networkTimeoutSeconds: 4 }),
)

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({ cacheName: 'pits-img', plugins: [new ExpirationPlugin({ maxEntries: 60 })] }),
)

self.addEventListener('push', (event) => {
  let payload: { title?: string; body?: string; data?: { url?: string } } = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Pits', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
      tag: payload.data?.url ?? 'pits',
      data: { url: payload.data?.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if (client.url.includes(target) && 'focus' in client) {
          await client.focus()
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
