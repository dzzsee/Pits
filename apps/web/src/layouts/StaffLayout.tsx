import { useSession } from '@/app/session'
import { AppShell, type NavItem } from '@/layouts/AppShell'
import { LinkButton } from '@/components/ui'
import { IconChart, IconGift, IconList, IconPlus, IconTag, IconUsers } from '@/components/icons'

export function StaffLayout() {
  const { user } = useSession()

  const nav: NavItem[] = [
    { to: '/taller', label: 'Ordenes', icon: IconList, end: true },
    { to: '/taller/estados', label: 'Estados', icon: IconTag },
    { to: '/taller/canjes', label: 'Canjes', icon: IconGift },
    ...(user?.role === 'admin'
      ? [
          { to: '/taller/reportes', label: 'Reportes', icon: IconChart },
          { to: '/taller/admin', label: 'Equipo', icon: IconUsers },
        ]
      : []),
  ]

  return (
    // El taller vive en el mismo shell que el cliente pero a todo el ancho: la
    // lista de ordenes es densa y recortarla obliga a scroll horizontal.
    <AppShell
      nav={nav}
      wide
      action={
        <LinkButton
          to="/taller/nueva"
          size="sm"
          icon={<IconPlus className="h-4 w-4" />}
          className="hidden sm:inline-flex"
        >
          Abrir orden
        </LinkButton>
      }
    />
  )
}