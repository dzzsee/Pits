import { usePush } from '@/lib/use-push'
import { Button } from '@/components/ui'

/**
 * Aviso para activar notificaciones. Se oculta si el usuario lo descarto o si
 * el navegador no soporta push; cuando push no esta configurado en el servidor
 * no se ofrece, porque la app ya notifica in-app.
 */
export function PushPrompt() {
  const { state, busy, subscribe, dismissed, dismiss } = usePush()

  if (dismissed) return null
  if (state !== 'default') return null

  return (
    <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-sm animate-slide-up rounded-2xl border border-line bg-surface-raised p-4 shadow-lift lg:bottom-6 lg:left-6 lg:right-auto lg:mx-0">
      <p className="text-sm font-semibold">Te avisamos al instante</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        Activa las notificaciones para saber cuando tu vehiculo cambia de estado, sin tener que
        abrir la app.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => void subscribe()} loading={busy}>
          Activar
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Ahora no
        </Button>
      </div>
    </div>
  )
}
