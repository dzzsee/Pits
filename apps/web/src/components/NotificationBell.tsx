import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { cx } from '@/shared/colors'
import { IconBell } from '@/components/icons'
import type { AppNotification } from '@/lib/types'
import { keys } from '@/lib/query-keys'

interface Payload {
  items: AppNotification[]
  unread: number
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: keys.notifications(),
    queryFn: () => api.get<Payload>('/notifications?limit=20'),
    refetchInterval: 60_000,
  })

  const markRead = useMutation({
    mutationFn: (id: number) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications() }),
  })

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications() }),
  })

  // Cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = data?.unread ?? 0

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <IconBell className="h-[18px] w-[18px]" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-semibold text-black">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-scale-in absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
          <div className="rule px-4 py-3">
            <span className="eyebrow">Notificaciones</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
              >
                Marcar todas
              </button>
            ) : null}
          </div>

          <div className="scroll-slim max-h-96 overflow-y-auto">
            {data?.items.length ? (
              <ul className="divide-y divide-line">
                {data.items.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.order_id ? `/reparacion/${n.order_id}` : '/'}
                      onClick={() => {
                        if (!n.read_at) markRead.mutate(n.id)
                        setOpen(false)
                      }}
                      className={cx(
                        'block px-4 py-3.5 transition-colors hover:bg-surface-hover',
                        !n.read_at && 'bg-accent/[0.04]',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cx(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            n.read_at ? 'bg-transparent' : 'bg-accent',
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p
                            className={cx(
                              'text-[13px] leading-snug',
                              n.read_at ? 'text-ink-muted' : 'font-medium text-ink',
                            )}
                          >
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{n.body}</p>
                          <p className="mt-1.5 font-mono text-[11px] text-ink-muted/70">
                            {formatRelative(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-12 text-center text-sm text-ink-muted">
                Aca te avisamos cuando tu reparacion avance.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}