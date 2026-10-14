import type { ReactNode } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { useStore } from "@/store/AppStore"
import type { Role } from "@/types"
import Login from "@/pages/auth/Login"
import Register from "@/pages/auth/Register"
import OrderPage from "@/pages/customer/Order"
import HistoryPage from "@/pages/customer/History"
import Dashboard from "@/pages/admin/Dashboard"
import AdminOrders from "@/pages/admin/Orders"
import AdminMenu from "@/pages/admin/Menu"
import AdminCustomers from "@/pages/admin/Customers"
import Reports from "@/pages/admin/Reports"

const homeFor = (role: Role) => (role === "admin" ? "/admin/dashboard" : "/order")

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { currentUser } = useStore()
  if (!currentUser) return <Navigate to="/login" replace />
  if (currentUser.role !== role) return <Navigate to={homeFor(currentUser.role)} replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { currentUser } = useStore()
  if (currentUser) return <Navigate to={homeFor(currentUser.role)} replace />
  return <>{children}</>
}

function RootRedirect() {
  const { currentUser } = useStore()
  return <Navigate to={currentUser ? homeFor(currentUser.role) : "/login"} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

      <Route element={<RequireRole role="customer"><AppShell variant="customer" /></RequireRole>}>
        <Route path="/order" element={<OrderPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>

      <Route path="/admin" element={<RequireRole role="admin"><AppShell variant="admin" /></RequireRole>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="menu" element={<AdminMenu />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="reports" element={<Reports />} />
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
