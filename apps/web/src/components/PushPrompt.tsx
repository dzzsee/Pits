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
    <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm animate-slide-up rounded-lg border border-line bg-surface/95 p-4 shadow-panel backdrop-blur-xl lg:bottom-6 lg:left-6 lg:right-auto lg:mx-0">
      <p className="eyebrow">Notificaciones</p>
      <p className="mt-2 text-sm font-medium">Te avisamos al instante</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        Activa las notificaciones para saber cuando tu vehiculo cambia de estado, sin tener que
        abrir la app.
      </p>
      <div className="mt-4 flex items-center gap-2">
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