import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowDownRight, ArrowUpRight, ChefHat, ClipboardList, PackageCheck, Receipt, TrendingUp, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/StatusBadge"
import { useStore } from "@/store/AppStore"
import { formatDateTime, peso } from "@/lib/format"
import { dailySeries, startOfDay, sumTotal, topItems, validOrders } from "@/lib/stats"

const OLIVE = "hsl(69 28% 35%)"
const GRID = "hsl(66 15% 82%)"

function Kpi({ title, value, delta, icon: Icon }: { title: string; value: string; delta?: number | null; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-muted-foreground">{title}</p>
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-4" /></span>
        </div>
        <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
        {delta != null && (
          <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta).toFixed(0)}% vs yesterday
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { orders } = useStore()

  const s = useMemo(() => {
    const today = startOfDay(new Date())
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const valid = validOrders(orders)
    const t = valid.filter((o) => new Date(o.createdAt) >= today)
    const y = valid.filter((o) => { const d = new Date(o.createdAt); return d >= yesterday && d < today })
    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
    return {
      revenue: sumTotal(t), orders: t.length, avg: t.length ? sumTotal(t) / t.length : 0,
      revenueDelta: pct(sumTotal(t), sumTotal(y)), ordersDelta: pct(t.length, y.length),
      pending: orders.filter((o) => o.status === "pending").length,
      preparing: orders.filter((o) => o.status === "preparing").length,
      ready: orders.filter((o) => o.status === "ready").length,
    }
  }, [orders])

  const series = useMemo(() => dailySeries(orders, 7), [orders])
  const top = useMemo(() => topItems(orders, 5), [orders])
  const recent = orders.slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Today's sales" value={peso(s.revenue)} delta={s.revenueDelta} icon={TrendingUp} />
        <Kpi title="Orders today" value={String(s.orders)} delta={s.ordersDelta} icon={Receipt} />
        <Kpi title="Average order" value={peso(Math.round(s.avg))} icon={PackageCheck} />
        <Kpi title="Open orders" value={String(s.pending + s.preparing + s.ready)} icon={ChefHat} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Sales, last 7 days</CardTitle><CardDescription>Cancelled orders are not counted.</CardDescription></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={OLIVE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={OLIVE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={(v) => `₱${v}`} />
                  <Tooltip formatter={(v) => [peso(Number(v)), "Sales"]} />
                  <Area type="monotone" dataKey="revenue" stroke={OLIVE} strokeWidth={2.5} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Best sellers</CardTitle><CardDescription>Cups sold, all time.</CardDescription></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip formatter={(v) => [String(v), "Cups"]} cursor={{ fill: "hsl(66 25% 88%)" }} />
                  <Bar dataKey="qty" fill={OLIVE} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent orders</CardTitle>
            <Button asChild variant="outline" size="sm"><Link to="/admin/orders">View all</Link></Button>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Time</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {recent.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold">{o.id}</TableCell>
                    <TableCell>{o.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(o.createdAt)}</TableCell>
                    <TableCell className="text-right font-semibold">{peso(o.total)}</TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Kitchen queue</CardTitle><CardDescription>Orders that still need attention.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Pending", n: s.pending, variant: "warning" as const },
              { label: "Preparing", n: s.preparing, variant: "info" as const },
              { label: "Ready for pickup", n: s.ready, variant: "default" as const },
            ].map((q) => (
              <div key={q.label} className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
                <Badge variant={q.variant}>{q.label}</Badge>
                <span className="text-2xl font-bold tabular-nums">{q.n}</span>
              </div>
            ))}
            <Button asChild className="w-full"><Link to="/admin/orders"><ClipboardList /> Manage orders</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
