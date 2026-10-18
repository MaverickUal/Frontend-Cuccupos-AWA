import type { ReactNode } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { useStore } from "@/store/AppStore"
import type { Role } from "@/types"
import Login from "@/pages/auth/Login"
import OrderPage from "@/pages/customer/Order"
import HistoryPage from "@/pages/customer/History"
import Dashboard from "@/pages/admin/Dashboard"
import AdminOrders from "@/pages/admin/Orders"
import AdminMenu from "@/pages/admin/Menu"
import AdminCashiers from "@/pages/admin/Cashiers"
import Reports from "@/pages/admin/Reports"

const homeFor = (role: Role) => (role === "admin" ? "/admin/dashboard" : "/order")

/**
 * Shown while Firebase Auth decides whether anyone is signed in.
 *
 * Without this, a hard refresh on a deep link (e.g. /admin/cashiers) renders the
 * guards while currentUser is still null, so RequireRole sends you to /login and
 * PublicOnly then sends you to the home page — the deep link is lost.
 */
function Waiting() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <Loader2 className="size-7 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { currentUser, authReady } = useStore()
  if (!authReady) return <Waiting />
  if (!currentUser) return <Navigate to="/login" replace />
  if (currentUser.role !== role) return <Navigate to={homeFor(currentUser.role)} replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { currentUser, authReady } = useStore()
  if (!authReady) return <Waiting />
  if (currentUser) return <Navigate to={homeFor(currentUser.role)} replace />
  return <>{children}</>
}

function RootRedirect() {
  const { currentUser, authReady } = useStore()
  if (!authReady) return <Waiting />
  return <Navigate to={currentUser ? homeFor(currentUser.role) : "/login"} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />

      <Route element={<RequireRole role="cashier"><AppShell variant="cashier" /></RequireRole>}>
        <Route path="/order" element={<OrderPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>

      <Route path="/admin" element={<RequireRole role="admin"><AppShell variant="admin" /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="menu" element={<AdminMenu />} />
        <Route path="cashiers" element={<AdminCashiers />} />
        <Route path="reports" element={<Reports />} />
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
