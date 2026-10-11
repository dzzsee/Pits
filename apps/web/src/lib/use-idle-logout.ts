import { useEffect, useRef } from 'react'

/** Minutos sin actividad antes de cerrar la sesion. */
const IDLE_MINUTES = 15
const FLAG_KEY = 'pits.idleExpired'

/**
 * Eventos que cuentan como actividad.
 *
 * Se excluye `mousemove` a proposito: dispara cientos de veces por minuto y
 * provocaria un reinicio de temporizador constante por cada pixel de recorrido
 * del raton. `pointerdown` y las teclas cubren la interaccion real.
 */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'focus',
] as const

/**
 * Marca que el cierre fue por inactividad, para que la pantalla de acceso
 * pueda avisar en vez de mostrar el login pelado.
 *
 * Va en `sessionStorage` y no en estado de React porque el aviso lo muestra
 * `LoginPage`, que se monta *despues* de que la sesion se haya cerrado: un
 * estado en memoria ya se habria perdido con el desmontaje.
 */
export function markIdleExpired(): void {
  try {
    window.sessionStorage.setItem(FLAG_KEY, '1')
  } catch {
    // Sin almacenamiento (modo privado): el login funciona igual, sin aviso.
  }
}

export function consumeIdleExpired(): boolean {
  try {
    const value = window.sessionStorage.getItem(FLAG_KEY)
    window.sessionStorage.removeItem(FLAG_KEY)
    return value === '1'
  } catch {
    return false
  }
}

/**
 * Cierra la sesion tras `IDLE_MINUTES` sin actividad.
 *
 * El plazo se controla con un `timeout` que se reinicia en cada actividad, no
 * con un `interval` que consulte la hora: asi no queda ningun temporizador vivo
 * cuando la sesion esta cerrada, y al entrar no hay un tick atrasado capaz de
 * cerrar la sesion recien iniciada.
 *
 * Ademas vigila `visibilitychange`: una pestana en segundo plano pasa minutos
 * sin eventos, y al volver a primer plano se comprueba si el plazo ya vencio.
 * Sin esa comprobacion, quien deje la pestana abierta en otra ventana volveria
 * con la sesion viva.
 */
export function useIdleLogout(enabled: boolean, onIdle: () => void): void {
  const lastActivity = useRef(Date.now())
  const timer = useRef<number | null>(null)
  // El cierre se dispara por dos caminos (el temporizador venció, y al volver
  // a primer plano se comprueba el reloj). Sin este guarda los dos pueden
  // coincidir y se enviaría el aviso dos veces.
  const fired = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const timeoutMs = IDLE_MINUTES * 60_000
    lastActivity.current = Date.now()
    fired.current = false

    const fire = () => {
      if (fired.current) return
      fired.current = true
      if (timer.current !== null) window.clearTimeout(timer.current)
      markIdleExpired()
      onIdle()
    }

    const schedule = () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(fire, timeoutMs)
    }

    const onActivity = () => {
      lastActivity.current = Date.now()
      schedule()
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      // Volver a primer plano no es actividad: si el plazo ya vencio mientras
      // la pestana estaba oculta, la sesion se cierra igualmente.
      if (Date.now() - lastActivity.current >= timeoutMs) {
        fire()
        return
      }
      schedule()
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisibility)
    schedule()

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity)
      }
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [enabled, onIdle])
}