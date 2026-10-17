import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowDownRight, ArrowUpRight, PackageCheck, Receipt, TrendingUp, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/StatusBadge"
import { RangePicker, defaultSelection, useRange, type RangeSelection } from "@/components/RangePicker"
import { useStore } from "@/store/AppStore"
import { formatDateTime, orderNo, peso } from "@/lib/format"
import { seriesFor, sumTotal, topItems, validOrders, type DateRange } from "@/lib/stats"

const OLIVE = "hsl(69 28% 35%)"
const GRID = "hsl(66 15% 82%)"

const ALL = "all"

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
  const { orders, users } = useStore()
  const [sel, setSel] = useState<RangeSelection>(defaultSelection)
  const [cashierId, setCashierId] = useState<string>(ALL)
  const range = useRange(sel)

  /**
   * Cashier filtering happens on `customerId`, never on the display name — two
   * cashiers could share a name, and renaming an account must not merge their
   * history.
   */
  const cashiers = useMemo(
    () =>
      users
        .filter((u) => u.role === "cashier")
        .map((u) => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  )

  const scoped = useMemo(
    () => (cashierId === ALL ? orders : orders.filter((o) => o.customerId === cashierId)),
    [orders, cashierId]
  )

  /** Totals for the selected window vs the immediately preceding window. */
  const s = useMemo(() => {
    const span = range.to.getTime() - range.from.getTime()
    const prevFrom = new Date(range.from.getTime() - span)
    const prevTo = new Date(range.from.getTime() - 1)
    const within = (o: { createdAt: string }, a: number, b: number) => {
      const t = Date.parse(o.createdAt)
      return Number.isFinite(t) && t >= a && t <= b
    }

    const all = validOrders(scoped)
    const from = range.from.getTime()
    const to = range.to.getTime()
    const current = all.filter((o) => within(o, from, to))
    const previous = all.filter((o) => within(o, prevFrom.getTime(), prevTo.getTime()))

    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
    const gross = sumTotal(current)
    const prevGross = sumTotal(previous)
    return {
      revenue: gross,
      orders: current.length,
      avg: current.length ? gross / current.length : 0,
      revenueDelta: pct(gross, prevGross),
      ordersDelta: pct(current.length, previous.length),
    }
  }, [scoped, range.from, range.to])

  const series = useMemo(() => seriesFor(scoped, range), [scoped, range])
  const inRangeOrders = useMemo(
    () =>
      validOrders(scoped).filter((o) => {
        const t = Date.parse(o.createdAt)
        return Number.isFinite(t) && t >= range.from.getTime() && t <= range.to.getTime()
      }),
    [scoped, range.from, range.to]
  )
  const top = useMemo(() => topItems(inRangeOrders, 5), [inRangeOrders])

  // "Recent orders" is deliberately NOT date-filtered: it answers "what just
  // happened", which must still work when today's range has no sales.
  const recent = scoped.slice(0, 6)
  const filtered = cashierId !== ALL
  const chartTitle = `Sales · ${range.label}`
  const scopeNote = filtered
    ? `Scoped to the selected cashier.`
    : `All cashiers.`
  const empty = !filtered && series.every((p) => p.orders === 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <RangePicker value={sel} onChange={setSel} />
        <div className="w-56 space-y-1.5">
          <Label htmlFor="dash-cashier">Cashier</Label>
          <Select value={cashierId} onValueChange={setCashierId}>
            <SelectTrigger id="dash-cashier" aria-label="Filter dashboard by cashier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Cashiers</SelectItem>
              {cashiers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi title="Sales" value={peso(s.revenue)} delta={s.revenueDelta} icon={TrendingUp} />
        <Kpi title="Orders" value={String(s.orders)} delta={s.ordersDelta} icon={Receipt} />
        <Kpi title="Average order" value={peso(Math.round(s.avg))} icon={PackageCheck} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Sales, Orders and Average are for <span className="font-semibold text-foreground">{range.label}</span>. {scopeNote}
      </p>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{chartTitle}</CardTitle>
            <CardDescription>
              {range.hourly ? "By hour." : "By day."} Cancelled orders are not counted. {scopeNote}
            </CardDescription>
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
                    formatter={(v) => [peso(Number(v)), "Sales"]}
                    labelFormatter={(_l, p: any) => {
                      const point = p?.[0]?.payload
                      return point ? formatDateTime(point.from.toISOString()) : ""
                    }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={OLIVE} strokeWidth={2.5} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {empty && (
              <p className="mt-2 text-center text-sm text-muted-foreground">
                No orders in this period. Try a longer range.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best sellers</CardTitle>
            <CardDescription>Cups sold · {range.label}. {scopeNote}</CardDescription>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No sales in this period.</p>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent orders</CardTitle>
            <CardDescription>Newest first, all time{filtered ? " for the selected cashier" : ""}.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/admin/orders">View all</Link></Button>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <Table>
            <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Cashier</TableHead><TableHead>Time</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {recent.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  {filtered ? "This cashier has no orders yet." : "No orders yet."}
                </TableCell></TableRow>
              )}
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