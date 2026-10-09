import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { readSetting, removeSetting, writeSetting } from '@/lib/storage'

const KEY_DISMISSED = 'pits.push.dismissed'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type PushState = 'unsupported' | 'disabled' | 'denied' | 'default' | 'granted' | 'subscribed'

function detectState(supported: boolean, enabled: boolean): PushState {
  if (!supported) return 'unsupported'
  if (!enabled) return 'disabled'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return 'default'
}

export interface PushConfig {
  enabled: boolean
  publicKey: string
}

/**
 * Suscripcion push con re-suscripcion automatica: si el navegador genera una
 * suscripcion nueva (rotacion de claves, service worker reiniciado), la
 * volvemos a enviar al servidor al montar.
 */
export function usePush() {
  const [state, setState] = useState<PushState>('default')
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(() => readSetting(KEY_DISMISSED) === '1')

  useEffect(() => {
    let alive = true

    const supported =
      typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

    if (!supported) {
      setState('unsupported')
      return
    }

    void (async () => {
      try {
        const config = await api.get<PushConfig>('/push/config')
        if (!alive) return
        setState(detectState(true, config.enabled && Boolean(config.publicKey)))
        if (!config.enabled || !config.publicKey) return

        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          await api.post('/push/subscribe', existing.toJSON()).catch(() => undefined)
          if (alive) setState('subscribed')
        }
      } catch {
        if (alive) setState('disabled')
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setBusy(true)
    try {
      const config = await api.get<PushConfig>('/push/config')
      if (!config.enabled || !config.publicKey) {
        setState('disabled')
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'default')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        }))

      await api.post('/push/subscribe', sub.toJSON())
      setState('subscribed')
      setDismissed(false)
      removeSetting(KEY_DISMISSED)
    } catch {
      setState('default')
    } finally {
      setBusy(false)
    }
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    writeSetting(KEY_DISMISSED, '1')
  }, [])

  return { state, busy, subscribe, dismissed, dismiss }
}
