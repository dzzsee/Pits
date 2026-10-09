import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { cx } from '@/shared/colors'
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
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 19a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notificaciones</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => {
                  api.patch('/notifications/read-all').then(() =>
                    queryClient.invalidateQueries({ queryKey: keys.notifications() }),
                  )
                }}
                className="text-[12px] font-medium text-ink-muted hover:text-ink"
              >
                Marcar leidas
              </button>
            ) : null}
          </div>

          <div className="scroll-slim max-h-80 overflow-y-auto">
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
                        'block px-4 py-3 transition-colors hover:bg-surface-sunken/60',
                        !n.read_at && 'bg-brand/[0.03]',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cx(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            n.read_at ? 'bg-transparent' : 'bg-brand',
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium leading-snug">{n.title}</p>
                          <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{n.body}</p>
                          <p className="mt-1 text-[11px] text-ink-subtle">
                            {formatRelative(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-ink-subtle">
                Aca te avisamos cuando tu reparacion avance.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
