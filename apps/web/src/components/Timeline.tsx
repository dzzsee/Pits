import { stateColor, cx } from '@/shared/colors'
import { formatDateTime } from '@/lib/format'
import type { StateEvent } from '@/lib/types'

/**
 * Linea de tiempo de la reparacion. Cada evento guarda una copia del label y
 * del color en el momento de crearse, asi que el historial no cambia aunque el
 * taller renombre un estado despues.
 *
 * Es el componente de marca del producto: lo primero que mira el cliente para
 * saber en que va su carro. Por eso el nodo lleva un anillo del color del
 * estado y la fecha va en mono, para leerla como un dato y no como texto.
 */
export function Timeline({ events, compact = false }: { events: StateEvent[]; compact?: boolean }) {
  if (!events.length) {
    return (
      <p className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
        Sin novedades aun.
      </p>
    )
  }

  return (
    <ol className={cx('relative', !compact && 'py-1')}>
      {events.map((e, i) => {
        const color = stateColor(e.state_color_snapshot)
        const isLast = i === events.length - 1
        const incident = e.is_incident === 1

        return (
          <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Conector vertical: llega al centro del nodo, no hasta el borde. */}
            {!isLast ? (
              <span
                className="absolute left-[6px] top-4 h-[calc(100%-1rem)] w-px bg-line"
                aria-hidden="true"
              />
            ) : null}

            <span
              className={cx(
                'relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-surface',
                incident ? 'bg-danger' : color.dot,
              )}
              aria-hidden="true"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <p
                  className={cx(
                    'font-mono text-[12px] font-medium uppercase tracking-[0.06em]',
                    incident ? 'text-danger' : 'text-ink',
                  )}
                >
                  {e.state_label_snapshot}
                </p>
                {incident ? (
                  <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-danger">
                    Contratiempo
                  </span>
                ) : null}
              </div>
              {e.note ? (
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{e.note}</p>
              ) : null}
              <p className="mt-1 font-mono text-[11px] text-ink-muted/70">
                {formatDateTime(e.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}