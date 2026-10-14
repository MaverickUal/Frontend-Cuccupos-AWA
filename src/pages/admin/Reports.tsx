import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useStore } from "@/store/AppStore"
import { formatDateTime, peso } from "@/lib/format"
import { byCategory, byPayment, startOfDay, sumTotal, topItems, validOrders } from "@/lib/stats"

type Range = "today" | "7d" | "30d" | "all"
const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
]

function cutoff(range: Range): Date | null {
  const today = startOfDay(new Date())
  if (range === "today") return today
  if (range === "7d" || range === "30d") {
    const d = new Date(today)
    d.setDate(today.getDate() - (range === "7d" ? 6 : 29))
    return d
  }
  return null
}

const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-5"><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></CardContent></Card>
  )
}

export default function Reports() {
  const { orders } = useStore()
  const [range, setRange] = useState<Range>("7d")
  const rangeLabel = RANGES.find((r) => r.value === range)!.label

  const r = useMemo(() => {
    const from = cutoff(range)
    const inRange = orders.filter((o) => !from || new Date(o.createdAt) >= from)
    const sales = validOrders(inRange)
    const days = new Map<string, { key: string; label: string; orders: number; revenue: number }>()
    sales.forEach((o) => {
      const k = dayKey(o.createdAt)
      const row = days.get(k) ?? { key: k, label: new Date(o.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" }), orders: 0, revenue: 0 }
      row.orders += 1
      row.revenue += o.total
      days.set(k, row)
    })
    const gross = sumTotal(sales)
    return {
      inRange, sales, gross,
      cancelled: inRange.length - sales.length,
      itemsSold: sales.reduce((s, o) => s + o.items.reduce((n, i) => n + i.qty, 0), 0),
      avg: sales.length ? gross / sales.length : 0,
      days: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)),
      categories: byCategory(sales),
      items: topItems(sales, 10),
      payments: byPayment(sales),
    }
  }, [orders, range])

  function exportCsv() {
    downloadCsv(`cuccupos-orders-${range}.csv`, [
      ["Order ID", "Date", "Customer", "Items", "Total (PHP)", "Payment", "Status"],
      ...r.inRange.map((o) => [o.id, new Date(o.createdAt).toLocaleString("en-PH"), o.customerName, o.items.map((i) => `${i.qty}x ${i.name}`).join("; "), o.total, o.paymentMethod, o.status]),
    ])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="w-44">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger aria-label="Report period"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={r.inRange.length === 0}><Download /> Export CSV</Button>
          <Button onClick={() => window.print()}><Printer /> Print / Save as PDF</Button>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">CuccuPOS Sales Report</h1>
        <p className="text-sm">{rangeLabel} · Generated {formatDateTime(new Date().toISOString())}</p>
      </div>

      {r.inRange.length === 0 ? (
        <p className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">No orders in this period. Pick a longer range.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Gross sales" value={peso(r.gross)} />
            <Stat label="Orders" value={String(r.sales.length)} />
            <Stat label="Cups sold" value={String(r.itemsSold)} />
            <Stat label="Average order" value={peso(Math.round(r.avg))} />
            <Stat label="Cancelled" value={String(r.cancelled)} />
          </div>

          <Card className="break-inside-avoid">
            <CardHeader><CardTitle>Daily sales</CardTitle></CardHeader>
            <CardContent>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.days} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid stroke="hsl(66 15% 82%)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={(v) => `₱${v}`} />
                    <Tooltip formatter={(v) => [peso(Number(v)), "Sales"]} cursor={{ fill: "hsl(66 25% 88%)" }} />
                    <Bar dataKey="revenue" fill="hsl(69 28% 35%)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Sales by category</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {r.categories.map((c) => {
                  const pct = r.gross ? (c.revenue / r.gross) * 100 : 0
                  return (
                    <div key={c.category}>
                      <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{c.category} <span className="font-normal text-muted-foreground">· {c.qty} cups</span></span><span>{peso(c.revenue)} ({pct.toFixed(0)}%)</span></div>
                      <div className="h-2 rounded-full bg-secondary"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Payment methods</CardTitle></CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader>
                  <TableBody>{r.payments.map((p) => <TableRow key={p.method}><TableCell className="font-semibold">{p.method}</TableCell><TableCell className="text-right">{p.orders}</TableCell><TableCell className="text-right">{peso(p.revenue)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Top items</CardTitle></CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Cups</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader>
                  <TableBody>{r.items.map((i) => <TableRow key={i.name}><TableCell className="font-semibold">{i.name}</TableCell><TableCell className="text-right">{i.qty}</TableCell><TableCell className="text-right">{peso(i.revenue)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Sales by day</CardTitle></CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader>
                  <TableBody>{[...r.days].reverse().map((d) => <TableRow key={d.key}><TableCell className="font-semibold">{d.label}</TableCell><TableCell className="text-right">{d.orders}</TableCell><TableCell className="text-right">{peso(d.revenue)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
