import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdleLogout, consumeIdleExpired, markIdleExpired } from '@/lib/use-idle-logout'

/**
 * Cierre de sesion por inactividad.
 *
 * El plazo son 15 minutos reales; aqui se comprueba con reloj falso, que es la
 * unica forma de verificar un comportamiento de minutos sin esperar minutos.
 */

const IDLE_MS = 15 * 60_000

describe('useIdleLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    try {
      window.sessionStorage.clear()
    } catch {
      /* sin almacenamiento: el resto del test sigue valiendo */
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cierra la sesion tras quince minutos sin actividad', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(true, onIdle))

    act(() => {
      vi.advanceTimersByTime(IDLE_MS - 1000)
    })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('una interaccion reinicia el plazo', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(true, onIdle))

    // A los 14 minutos hay actividad: el contador vuelve a cero.
    act(() => {
      vi.advanceTimersByTime(IDLE_MS - 60_000)
    })
    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })

    act(() => {
      vi.advanceTimersByTime(IDLE_MS - 60_000)
    })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('no hace nada si la sesion no esta activa', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(false, onIdle))

    act(() => {
      vi.advanceTimersByTime(IDLE_MS * 3)
    })
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('al volver a primer plano con el plazo vencido, cierra igual', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleLogout(true, onIdle))

    // Una pestana en segundo plano no recibe eventos, asi que el paso del tiempo
    // no reinicia nada. Al volver, el hook comprueba el reloj.
    act(() => {
      vi.advanceTimersByTime(IDLE_MS + 60_000)
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('deja marca de que el cierre fue por inactividad', () => {
    markIdleExpired()
    // El aviso se lee una sola vez: al entrar de nuevo ya no aplica.
    expect(consumeIdleExpired()).toBe(true)
    expect(consumeIdleExpired()).toBe(false)
  })

  it('limpia el temporizador al desmontar', () => {
    const onIdle = vi.fn()
    const { unmount } = renderHook(() => useIdleLogout(true, onIdle))
    unmount()

    act(() => {
      vi.advanceTimersByTime(IDLE_MS * 2)
    })
    // Ningun temporizador sobrevive: si sobreviviria, cerraria una sesion que
    // ya no existe al volver a entrar.
    expect(onIdle).not.toHaveBeenCalled()
  })
})