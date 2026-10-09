import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useSession } from '@/app/session'
import { Logo } from '@/components/Logo'
import { cx } from '@/shared/colors'
import { NotificationBell } from '@/components/NotificationBell'
import { PushPrompt } from '@/components/PushPrompt'
import { UpdateToast } from '@/components/UpdateToast'

const NAV = [
  { to: '/', label: 'Inicio', icon: IconHome, end: true },
  { to: '/reparaciones', label: 'Reparaciones', icon: IconWrench, end: false },
  { to: '/vehiculos', label: 'Vehiculos', icon: IconCar, end: false },
  { to: '/fidelizacion', label: 'Puntos', icon: IconStar, end: false },
  { to: '/cuenta', label: 'Cuenta', icon: IconUser, end: false },
]

export function ClientLayout() {
  const { user } = useSession()

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col lg:flex-row">
      {/* Navegacion lateral en escritorio */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo />
          <div>
            <p className="text-[15px] font-semibold leading-tight tracking-tight">Pits</p>
            <p className="text-[11px] text-ink-subtle">Taller</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-surface-sunken text-ink'
                    : 'text-ink-muted hover:bg-surface-sunken/60 hover:text-ink',
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <p className="mt-auto px-3 text-[12px] text-ink-subtle">
          Hola, {user?.name.split(' ')[0]}
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-tight">Pits</span>
          </div>
          <NotificationBell />
        </header>

        <div className="hidden items-center justify-end px-6 py-3 lg:flex">
          <NotificationBell />
        </div>

        <main className="flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-2">
          <Outlet />
        </main>

        {/* Barra inferior en movil */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          <ul className="grid grid-cols-5">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx(
                      'flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition-colors',
                      isActive ? 'text-ink' : 'text-ink-subtle',
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <PushPrompt />
        <UpdateToast />
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

/* ------------------------------- Icons ------------------------------ */

function IconHome({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z" strokeLinejoin="round" />
    </svg>
  )
}

function IconWrench({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M15.5 4a5 5 0 0 0-4.6 7L4 18l2 2 7-6.9A5 5 0 1 0 15.5 4Z" strokeLinejoin="round" />
    </svg>
  )
}

function IconCar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M5 17v2a1 1 0 0 1-1 1H3v-2M21 17v2a1 1 0 0 1-1 1h-1v-2M4 17h16M5 17l1.2-5.2A2 2 0 0 1 8.1 10h7.8a2 2 0 0 1 1.9 1.8L19 17M8 14h.01M16 14h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 4Z" strokeLinejoin="round" />
    </svg>
  )
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
    </svg>
  )
}
