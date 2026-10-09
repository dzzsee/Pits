import { stateColor, cx } from '@/shared/colors'
import { formatDateTime } from '@/lib/format'
import type { StateEvent } from '@/lib/types'

/**
 * Linea de tiempo de la reparacion. Cada evento guarda una copia del label y
 * del color en el momento de crearse, asi que el historial no cambia aunque el
 * taller renombre un estado despues.
 */
export function Timeline({
  events,
  compact = false,
}: {
  events: StateEvent[]
  compact?: boolean
}) {
  if (!events.length) {
    return <p className="py-6 text-center text-sm text-ink-subtle">Sin novedades aun.</p>
  }

  return (
    <ol className={cx('relative', !compact && 'py-1')}>
      {events.map((e, i) => {
        const color = stateColor(e.state_color_snapshot)
        const isLast = i === events.length - 1
        const incident = e.is_incident === 1

        return (
          <li key={e.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* Linea vertical, salvo en el ultimo nodo */}
            {!isLast ? (
              <span
                className="absolute left-[7px] top-5 h-[calc(100%-1.25rem)] w-px bg-line"
                aria-hidden="true"
              />
            ) : null}

            <span
              className={cx(
                'relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-surface-raised',
                incident ? 'bg-rose-500' : color.dot,
              )}
              aria-hidden="true"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className={cx('text-[14px] font-medium', incident && 'text-rose-600 dark:text-rose-400')}>
                  {e.state_label_snapshot}
                </p>
                {incident ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    Contratiempo
                  </span>
                ) : null}
                <span className="text-[12px] text-ink-subtle">{formatDateTime(e.created_at)}</span>
              </div>
              {e.note ? (
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{e.note}</p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
