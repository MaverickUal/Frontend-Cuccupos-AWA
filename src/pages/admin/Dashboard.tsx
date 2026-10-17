import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowDownRight, ArrowUpRight, PackageCheck, Receipt, TrendingUp, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/StatusBadge"
import { RangePicker, defaultSelection, useRange, type RangeSelection } from "@/components/RangePicker"
import { useStore } from "@/store/AppStore"
import { formatDateTime, orderNo, peso } from "@/lib/format"
import { seriesFor, startOfDay, sumTotal, topItems, validOrders } from "@/lib/stats"

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
            {Math.abs(delta).toFixed(0)}% vs previous period
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { orders } = useStore()
  const [sel, setSel] = useState<RangeSelection>(defaultSelection)
  const range = useRange(sel)

  /** Totals for the selected period, compared with the period immediately before it. */
  const s = useMemo(() => {
    const span = range.to.getTime() - range.from.getTime()
    const prevFrom = new Date(range.from.getTime() - span)
    const prevTo = new Date(range.from.getTime() - 1)

    const scoped = validOrders(orders).filter((o) => {
      const t = new Date(o.createdAt)
      return t >= range.from && t <= range.to
    })
    const previous = validOrders(orders).filter((o) => {
      const t = new Date(o.createdAt)
      return t >= prevFrom && t <= prevTo
    })

    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
    const gross = sumTotal(scoped)
    const prevGross = sumTotal(previous)
    return {
      revenue: gross,
      orders: scoped.length,
      avg: scoped.length ? gross / scoped.length : 0,
      revenueDelta: pct(gross, prevGross),
      ordersDelta: pct(scoped.length, previous.length),
    }
  }, [orders, range.from, range.to])

  const series = useMemo(() => seriesFor(orders, range), [orders, range])
  const top = useMemo(() => topItems(validOrders(orders).filter((o) => {
    const t = new Date(o.createdAt)
    return t >= range.from && t <= range.to
  }), 5), [orders, range.from, range.to])

  const recent = useMemo(
    () =>
      [...orders]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    [orders]
  )

  return (
    <div className="space-y-6">
      <RangePicker value={sel} onChange={setSel} className="flex flex-wrap items-end justify-between gap-3" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi title={`Sales · ${range.label}`} value={peso(s.revenue)} delta={s.revenueDelta} icon={TrendingUp} />
        <Kpi title="Orders" value={String(s.orders)} delta={s.ordersDelta} icon={Receipt} />
        <Kpi title="Average order" value={peso(Math.round(s.avg))} icon={PackageCheck} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Sales · {range.label}</CardTitle>
              <CardDescription>
                {range.hourly ? "By hour." : "By day."} Cancelled orders are not counted.
              </CardDescription>
            </div>
          </CardHeader>
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
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={(v) => `₱${v}`} />
                  <Tooltip
                    formatter={(v, _n, p: any) => [peso(Number(v)), "Sales"]}
                    labelFormatter={(_l, p: any) => {
                      const point = p?.[0]?.payload
                      return point ? `${formatDateTime(point.from.toISOString())} – ${formatDateTime(point.to.toISOString())}` : ""
                    }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={OLIVE} strokeWidth={2.5} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best sellers</CardTitle>
            <CardDescription>Cups sold · {range.label}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip formatter={(v) => [String(v), "Cups"]} cursor={{ fill: "hsl(66 25% 88%)" }} />
                  <Bar dataKey="qty" fill={OLIVE} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent orders</CardTitle>
          <Button asChild variant="outline" size="sm"><Link to="/admin/orders">View all</Link></Button>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Cashier</TableHead><TableHead>Time</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {recent.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">{orderNo(o)}</TableCell>
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
    </div>
  )
}