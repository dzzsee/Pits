import { AppShell, type NavItem } from '@/layouts/AppShell'
import { IconCar, IconHome, IconStar, IconUser, IconWrench } from '@/components/icons'

const NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: IconHome, end: true },
  { to: '/reparaciones', label: 'Reparaciones', icon: IconWrench },
  { to: '/vehiculos', label: 'Vehiculos', icon: IconCar },
  { to: '/fidelizacion', label: 'Puntos', icon: IconStar },
  { to: '/cuenta', label: 'Cuenta', icon: IconUser },
]

export function ClientLayout() {
  return <AppShell nav={NAV} />
}