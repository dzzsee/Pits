import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/app/session'
import { Logo } from '@/components/Logo'
import { NotificationBell } from '@/components/NotificationBell'
import { PushPrompt } from '@/components/PushPrompt'
import { cx } from '@/shared/colors'
import { IconLogout } from '@/components/icons'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
}

/**
 * Shell unico de los dos portales.
 *
 * Antes `ClientLayout` y `StaffLayout` eran casi el mismo componente
 * duplicado, y se habian ido separando sin querer: el cliente estaba limitado
 * a `max-w-5xl` y el taller no, uno reservaba espacio con `pb-28` en el main y
 * el otro con un spacer. Aqui solo cambia la configuracion.
 */
export function AppShell({
  nav,
  wide,
  action,
}: {
  nav: NavItem[]
  /** El portal del taller necesita todo el ancho; el del cliente, no. */
  wide?: boolean
  action?: ReactNode
}) {
  const { user, logout } = useSession()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // En movil el menu lateral es un panel sobre el contenido: al navegar tiene
  // que cerrarse, o tapa la pantalla que acaba de abrir.
  useEffect(() => setMenuOpen(false), [location.pathname])

  return (
    <div className="flex min-h-full">
      {/* ------------------------- Escritorio ------------------------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line px-6 py-7 lg:flex">
        <Brand />

        <nav className="mt-8 flex flex-col">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass} title={label}>
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <UserFooter user={user} logout={logout} />
        </div>
      </aside>

      {/* --------------------------- Movil ----------------------------- */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="animate-slide-up relative flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-surface px-6 py-7"
            aria-label="Navegacion"
          >
            <Brand />
            <nav className="mt-8 flex flex-col">
              {nav.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={navClass} title={label}>
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto">
              <UserFooter user={user} logout={logout} />
            </div>
          </aside>
        </div>
      ) : null}

      {/* -------------------------- Contenido ------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/85 px-6 py-4 backdrop-blur-xl lg:px-16">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <span className="font-display text-lg uppercase tracking-[0.06em] lg:hidden">Pits</span>

          <div className="ml-auto flex items-center gap-2">
            {action}
            <NotificationBell />
          </div>
        </header>

        <main
          className={cx(
            // Margen interior holgado. En pantallas anchas el contenido se
            // cierra a `max-w-shell` y necesita aire a los lados: pegado al
            // borde de la ventana el contenido se siente fuera de sitio.
            'flex-1 px-6 pb-32 pt-10 lg:px-16 lg:pb-16 lg:pt-14',
            wide ? 'mx-auto w-full max-w-shell' : 'mx-auto w-full max-w-4xl',
          )}
        >
          <Outlet />
        </main>

        <BottomNav nav={nav} />
        <PushPrompt />
      </div>
    </div>
  )
}

/**
 * La posicion activa se marca con una regla ambar a la izquierda, no con un
 * relleno de fondo. En un sistema que ya usa el relleno para superficies, la
 * seccion activa se distingue mejor con una linea.
 */
function navClass({ isActive }: { isActive: boolean }): string {
  return cx(
    'group relative flex items-center gap-3 rounded py-2.5 pl-3 pr-2 text-sm font-medium transition-colors duration-200',
    'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-accent before:transition-opacity before:duration-300',
    isActive ? 'text-ink before:opacity-100' : 'text-ink-muted before:opacity-0 hover:bg-surface-hover hover:text-ink',
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <Logo className="h-7 w-7" />
      <div>
        <p className="font-display text-xl uppercase leading-none tracking-[0.06em]">Pits</p>
        <p className="eyebrow mt-1">Taller</p>
      </div>
    </Link>
  )
}

function UserFooter({
  user,
  logout,
}: {
  user: { name: string; role: string } | null
  logout: () => void
}) {
  if (!user) return null

  const role = user.role === 'admin' ? 'Administrador' : user.role === 'mechanic' ? 'Mecanico' : 'Cliente'

  return (
    <div className="rounded border border-line bg-surface p-3">
      <p className="truncate text-sm font-medium">{user.name}</p>
      <p className="eyebrow mt-1">{role}</p>
      <button
        type="button"
        onClick={logout}
        className="mt-3 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted transition-colors hover:text-accent"
      >
        <IconLogout className="h-3.5 w-3.5" />
        Cerrar sesion
      </button>
    </div>
  )
}

function BottomNav({ nav }: { nav: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {/* El numero de columnas sale de la navegacion: el taller tiene 3 o 5
          secciones segun el rol, y antes se fijaba en 5 para el cliente. */}
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-1 px-1 py-2.5 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors',
                  isActive ? 'text-accent' : 'text-ink-muted',
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}