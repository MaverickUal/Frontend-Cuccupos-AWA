import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Bell, BarChart3, ChevronDown, ClipboardList, Coffee, CupSoda, History, LayoutDashboard, LogOut, UserCircle2, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Logo } from "@/components/Logo"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useStore } from "@/store/AppStore"
import { orderNo, peso } from "@/lib/format"
import { cn } from "@/lib/utils"

interface NavItem { to: string; label: string; icon: LucideIcon }

const customerNav: NavItem[] = [
  { to: "/order", label: "Order", icon: Coffee },
  { to: "/history", label: "History", icon: History },
]
const adminNav: NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/orders", label: "Orders", icon: ClipboardList },
  { to: "/admin/menu", label: "Menu", icon: CupSoda },
  { to: "/admin/cashiers", label: "Cashiers", icon: Users },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
]

function NotificationBell({ variant }: { variant: "cashier" | "admin" }) {
  const { orders, currentUser } = useStore()
  const navigate = useNavigate()
  const items =
    variant === "admin"
      ? orders.filter((o) => o.status === "pending")
      : orders.filter((o) => o.customerId === currentUser?.id && o.status === "ready")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-lg p-2 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Notifications (${items.length})`}>
          <Bell className="size-5 fill-current" />
          {items.length > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-background" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{variant === "admin" ? "New orders" : "Ready for pickup"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">You're all caught up.</p>}
        {items.slice(0, 5).map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => navigate(variant === "admin" ? "/admin/orders" : "/history")} className="flex-col items-start gap-0">
            <span className="font-semibold">{variant === "admin" ? `${orderNo(o)} from ${o.customerName}` : `${orderNo(o)} is ready`}</span>
            <span className="text-xs text-muted-foreground">{peso(o.total)} · {Object.values(o.items).reduce((s: number, i: any) => s + i.qty, 0)} items</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ variant }: { variant: "cashier" | "admin" }) {
  const nav = variant === "admin" ? adminNav : customerNav
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { currentUser, logout } = useStore()
  const active = nav.find((n) => pathname.startsWith(n.to)) ?? nav[0]
  const ActiveIcon = active.icon
  const displayName = variant === "admin" ? "Owner/Manager" : currentUser?.name ?? "Cashier"

  return (
    <div className="relative flex h-screen gap-4 overflow-hidden bg-sidebar lg:p-5 print:block print:h-auto print:overflow-visible print:bg-white print:p-0">
      {/* Sidebar */}
      <aside className="relative hidden w-60 shrink-0 flex-col overflow-hidden lg:flex print:hidden">
        <Logo className="px-2 pt-1" />
        <nav className="mt-14 flex flex-col gap-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-lg font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-active/50",
                  isActive && "bg-sidebar-active shadow-lg"
                )
              }
            >
              <Icon className="size-6" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Coffee aria-hidden className="pointer-events-none absolute -bottom-20 -left-20 size-72 text-sidebar-foreground/10" strokeWidth={1.25} />
        <div className="mt-auto flex items-center gap-2 px-2 pb-1 text-sm font-semibold text-sidebar-foreground/90">
          <span className="size-2 rounded-full bg-green-400" /> CuccuPos v1.0
        </div>
      </aside>

      {/* Main card */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background shadow-2xl lg:rounded-[2rem] print:overflow-visible print:rounded-none print:shadow-none">
        <header className="flex items-center justify-between gap-4 px-5 pb-3 pt-5 lg:px-8 lg:pt-7 print:hidden">
          <div className="flex items-center gap-3">
            <ActiveIcon className="size-7" />
            <h1 className="text-2xl font-bold lg:text-3xl">{active.label}</h1>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell variant={variant} />
            <span className="mx-2 h-7 w-px bg-foreground/70" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <UserCircle2 className="size-6" />
                  <span className="max-w-[9rem] truncate">{displayName}</span>
                  <ChevronDown className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="flex flex-col">
                  {displayName}
                  <span className="text-xs font-normal text-muted-foreground">{currentUser?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { logout(); navigate("/login") }}>
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="mx-5 border-b border-foreground/40 lg:mx-8 print:hidden" />
        <main className="flex-1 overflow-y-auto px-5 pb-28 pt-5 lg:px-8 lg:pb-8 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex bg-sidebar shadow-[0_-4px_12px_rgba(0,0,0,0.15)] lg:hidden print:hidden">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-sidebar-foreground/80", isActive && "bg-sidebar-active text-sidebar-foreground")
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
