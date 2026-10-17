import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RangePicker, defaultSelection, useRange, type RangeSelection } from "@/components/RangePicker"
import { useStore } from "@/store/AppStore"
import { formatDateTime, orderNo, peso } from "@/lib/format"
import { byCategory, inRange, seriesFor, sumTotal, topItems, validOrders } from "@/lib/stats"

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }))
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
  const [sel, setSel] = useState<RangeSelection>(defaultSelection)
  const range = useRange(sel)

  const r = useMemo(() => {
    const scoped = inRange(orders, range)
    const sales = validOrders(scoped)
    const gross = sumTotal(sales)
    return {
      inRange: scoped,
      sales,
      gross,
      cancelled: scoped.length - sales.length,
      itemsSold: sales.reduce((s, o) => s + Object.values(o.items).reduce((n, i) => n + i.qty, 0), 0),
      avg: sales.length ? gross / sales.length : 0,
      cash: sales.reduce((s, o) => s + (o.cashTendered ?? o.total), 0),
      change: sales.reduce((s, o) => s + (o.changeGiven ?? 0), 0),
      series: seriesFor(orders, range),
      categories: byCategory(sales),
      items: topItems(sales, 10),
    }
  }, [orders, range])

  function exportCsv() {
    downloadCsv(`cuccupos-orders-${range.preset}.csv`, [
      ["Order ID", "Date", "Cashier", "Items", "Total (PHP)", "Cash Tendered (PHP)", "Change (PHP)", "Status"],
      ...r.inRange.map((o) => [
        orderNo(o),
        new Date(o.createdAt).toLocaleString("en-PH"),
        o.customerName,
        Object.values(o.items).map((i) => `${i.qty}x ${i.name}`).join("; "),
        o.total,
        o.cashTendered ?? "",
        o.changeGiven ?? "",
        o.status,
      ]),
    ])
  }

  const chartTitle = range.hourly ? "Sales by hour" : range.label === "Last 7 days" || range.label === "Last 30 days" ? "Daily sales" : `Sales · ${range.label}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <RangePicker value={sel} onChange={setSel} idPrefix="report" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={r.inRange.length === 0}><Download /> Export CSV</Button>
          <Button onClick={() => window.print()}><Printer /> Print / Save as PDF</Button>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">CuccuPOS Sales Report</h1>
        <p className="text-sm">{range.label} · Generated {formatDateTime(new Date().toISOString())}</p>
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
            <CardHeader><CardTitle>{chartTitle}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.series} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid stroke="hsl(66 15% 82%)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={(v) => `₱${v}`} />
                    <Tooltip
                      cursor={{ fill: "hsl(66 25% 88%)" }}
                      formatter={(v) => [peso(Number(v)), "Sales"]}
                      labelFormatter={(_l, p: any) => {
                        const point = p?.[0]?.payload
                        return point ? `${formatDateTime(point.from.toISOString())} – ${formatDateTime(point.to.toISOString())}` : ""
                      }}
                    />
                    <Bar dataKey="revenue" fill="hsl(69 28% 35%)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader><CardTitle>Cash summary</CardTitle></CardHeader>
            <CardContent className="px-0 pb-2">
              <Table>
                <TableHeader><TableRow><TableHead>Measure</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell className="font-semibold">Sales collected (cash)</TableCell><TableCell className="text-right font-semibold">{peso(r.cash)}</TableCell></TableRow>
                  <TableRow><TableCell className="font-semibold">Less change given out</TableCell><TableCell className="text-right font-semibold">{peso(r.change)}</TableCell></TableRow>
                  <TableRow><TableCell className="font-semibold">Net in drawer</TableCell><TableCell className="text-right font-bold">{peso(r.cash - r.change)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Sales by category</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {r.categories.length === 0 && <p className="text-sm text-muted-foreground">No sales in this period.</p>}
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
              <CardHeader><CardTitle>Top items</CardTitle></CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Cups</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader>
                  <TableBody>{r.items.map((i) => <TableRow key={i.name}><TableCell className="font-semibold">{i.name}</TableCell><TableCell className="text-right">{i.qty}</TableCell><TableCell className="text-right">{peso(i.revenue)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {!range.hourly && (
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Sales by day</CardTitle></CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader>
                  <TableBody>{[...r.series].reverse().map((d) => <TableRow key={d.label}><TableCell className="font-semibold">{d.label}</TableCell><TableCell className="text-right">{d.orders}</TableCell><TableCell className="text-right">{peso(d.revenue)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}