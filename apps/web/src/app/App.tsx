import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession, homeFor } from '@/app/session'
import { Spinner } from '@/components/ui'
import { UpdateToast } from '@/components/UpdateToast'
import { ClientLayout } from '@/layouts/ClientLayout'
import { StaffLayout } from '@/layouts/StaffLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { DashboardPage } from '@/features/client/DashboardPage'
import { RepairDetailPage } from '@/features/client/RepairDetailPage'
import { RepairsPage } from '@/features/client/RepairsPage'
import { VehiclesPage } from '@/features/client/VehiclesPage'
import { LoyaltyPage } from '@/features/client/LoyaltyPage'
import { AccountPage } from '@/features/client/AccountPage'
import { WorkshopPage } from '@/features/staff/WorkshopPage'
import { OrderDetailPage } from '@/features/staff/OrderDetailPage'
import { NewOrderPage } from '@/features/staff/NewOrderPage'
import { StatesPage } from '@/features/staff/StatesPage'
import { RedeemPage } from '@/features/staff/RedeemPage'
import { AdminPage } from '@/features/admin/AdminPage'
import { ReportsPage } from '@/features/admin/ReportsPage'
import type { Role } from '@/lib/types'

function FullScreenLoader() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <Spinner className="h-6 w-6 text-accent" />
      <p className="eyebrow">Cargando</p>
    </div>
  )
}

function Protected({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, status } = useSession()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}

export function App() {
  const { user, status } = useSession()

  if (status === 'loading') return <FullScreenLoader />

  return (
    <>
      {/* El aviso de actualizacion vive aqui, no en los layouts: si cuelga de
          la pantalla, quien esta en `/entrar` se queda sin el y con el service
          worker viejo sirviendo el bundle anterior. */}
      <UpdateToast />
      <Routes>
      <Route
        path="/entrar"
        element={user ? <Navigate to={homeFor(user.role)} replace /> : <LoginPage />}
      />
      <Route
        path="/registro"
        element={user ? <Navigate to={homeFor(user.role)} replace /> : <RegisterPage />}
      />

      {/* Portal del cliente */}
      <Route
        element={
          <Protected roles={['client']}>
            <ClientLayout />
          </Protected>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/reparaciones" element={<RepairsPage />} />
        <Route path="/reparacion/:id" element={<RepairDetailPage />} />
        <Route path="/vehiculos" element={<VehiclesPage />} />
        <Route path="/fidelizacion" element={<LoyaltyPage />} />
        <Route path="/cuenta" element={<AccountPage />} />
      </Route>

      {/* Portal del taller */}
      <Route
        element={
          <Protected roles={['mechanic', 'admin']}>
            <StaffLayout />
          </Protected>
        }
      >
        <Route path="/taller" element={<WorkshopPage />} />
        <Route path="/taller/orden/:id" element={<OrderDetailPage />} />
        <Route path="/taller/nueva" element={<NewOrderPage />} />
        <Route path="/taller/estados" element={<StatesPage />} />
        <Route path="/taller/canjes" element={<RedeemPage />} />
        <Route
          path="/taller/admin"
          element={
            <Protected roles={['admin']}>
              <AdminPage />
            </Protected>
          }
        />
        <Route
          path="/taller/reportes"
          element={
            <Protected roles={['admin']}>
              <ReportsPage />
            </Protected>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/entrar'} replace />} />
      </Routes>
    </>
  )
}
