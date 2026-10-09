import { NavLink, Outlet } from 'react-router-dom'
import { useSession } from '@/app/session'
import { Logo } from '@/components/Logo'
import { cx } from '@/shared/colors'
import { useTheme } from '@/lib/use-theme'

export function StaffLayout() {
  const { user, logout } = useSession()
  const { theme, toggle } = useTheme()

  const links = [
    { to: '/taller', label: 'Ordenes', icon: IconList, end: true },
    { to: '/taller/estados', label: 'Estados', icon: IconTag, end: false },
    { to: '/taller/canjes', label: 'Canjes', icon: IconGift, end: false },
    ...(user?.role === 'admin'
      ? [
          { to: '/taller/reportes', label: 'Reportes', icon: IconChart, end: false },
          { to: '/taller/admin', label: 'Equipo', icon: IconUsers, end: false },
        ]
      : []),
  ]

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <Logo className="h-7 w-7" />
          <div>
            <p className="text-[15px] font-semibold leading-tight tracking-tight">Pits</p>
            <p className="text-[11px] text-ink-subtle">Taller</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
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

        <div className="mt-auto space-y-1">
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken/60 hover:text-ink"
          >
            {theme === 'dark' ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
            {theme === 'dark' ? 'Claro' : 'Oscuro'}
          </button>
          <div className="px-3 py-2">
            <p className="truncate text-[13px] font-medium">{user?.name}</p>
            <button
              type="button"
              onClick={logout}
              className="text-[12px] text-ink-subtle hover:text-ink"
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-tight">Pits</span>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken"
            aria-label="Cambiar tema"
          >
            {theme === 'dark' ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
          </button>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-7">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium',
                  isActive ? 'text-ink' : 'text-ink-subtle',
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="h-16 lg:hidden" />
      </div>
    </div>
  )
}

function IconList({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
    </svg>
  )
}

function IconTag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8-8-8Z" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </svg>
  )
}

function IconGift({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8ZM3 7h18v4H3zM12 7v13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7S9.5 3 7.5 4.2 9 7 12 7Zm0 0s2.5-4 4.5-2.8S15 7 12 7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  )
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 19a6 6 0 0 1 12 0M16 6.2a3 3 0 0 1 0 5.6M17.5 14.2A5.5 5.5 0 0 1 21 19" strokeLinecap="round" />
    </svg>
  )
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
    </svg>
  )
}
