import { useMemo, useState } from "react"
import { Search, Undo2, Receipt } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/StatusBadge"
import { RefundDialog } from "@/components/RefundDialog"
import { ReceiptDialog } from "@/components/ReceiptDialog"
import { useStore } from "@/store/AppStore"
import { formatDateTime, orderNo, peso } from "@/lib/format"
import { remainingRefundable } from "@/lib/finance"
import { cn } from "@/lib/utils"
import type { OrderStatus } from "@/types"

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  pending: { status: "preparing", label: "Start preparing" },
  preparing: { status: "ready", label: "Mark ready" },
  ready: { status: "completed", label: "Complete" },
}
/** Rows rendered before the table stops. Older orders remain searchable. */
const CAP = 100

const FILTERS: ("all" | OrderStatus)[] = ["all", "pending", "preparing", "ready", "completed", "cancelled"]
const label = (f: string) => (f === "all" ? "All" : f[0].toUpperCase() + f.slice(1))

export default function AdminOrders() {
  const { orders, updateOrderStatus } = useStore()
  const [filter, setFilter] = useState<"all" | OrderStatus>("all")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refundOpen, setRefundOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length }
    orders.forEach((o) => (c[o.status] = (c[o.status] ?? 0) + 1))
    return c
  }, [orders])

  // `orders` arrives newest-first from the store, and filter() preserves that
  // order. Re-sorting here would be redundant and risks diverging from the store.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        (!q || orderNo(o).toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
    )
  }, [orders, filter, search])

  const selected = orders.find((o) => o.id === selectedId) ?? null

  async function advance(id: string, status: OrderStatus, name: string) {
    await updateOrderStatus(id, status)
    const order = orders.find((o) => o.id === id)
    toast.success(`${order ? orderNo(order) : id} · ${name}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn("rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors", filter === f ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-accent")}
            >
              {label(f)} <span className="opacity-70">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search orders" className="pl-9" placeholder="Search by order number or cashier…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead><TableHead>Cashier</TableHead><TableHead>Items</TableHead><TableHead>Placed</TableHead>
              <TableHead>Payment</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">No orders match these filters.</TableCell></TableRow>}
            {rows.slice(0, CAP).map((o) => {
              const next = NEXT[o.status]
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">{orderNo(o)}</TableCell>
                  <TableCell>{o.customerName}</TableCell>
                  <TableCell className="max-w-[14rem] truncate text-muted-foreground">{Object.values(o.items).map((i) => `${i.qty}× ${i.name}`).join(", ")}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(o.createdAt)}</TableCell>
                  <TableCell>{o.paymentMethod}</TableCell>
                  <TableCell className="text-right font-semibold">{peso(o.total)}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(o.id)}>Details</Button>
                    {next && <Button size="sm" onClick={() => advance(o.id, next.status, next.label)}>{next.label}</Button>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/*
        Honest about the cap: sorting makes the newest-first rows the ones shown,
        but older orders beyond the cap still exist. Search by order number or
        cashier to reach them.
      */}
      {rows.length > CAP && (
        <p className="text-center text-xs text-muted-foreground">
          Showing the {CAP} most recent of {rows.length} matching orders. Refine your search to see others.
        </p>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{orderNo(selected)}</DialogTitle>
                <DialogDescription>{selected.customerName} · {formatDateTime(selected.createdAt)} · {selected.paymentMethod}</DialogDescription>
              </DialogHeader>
              <StatusBadge status={selected.status} />
              <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
                {Object.values(selected.items).map((i) => <div key={i.menuItemId} className="flex justify-between"><span>{i.qty} × {i.name}</span><span>{peso(i.qty * i.price)}</span></div>)}
                <div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{peso(selected.total)}</span></div>
              </div>
              {(selected.subtotal ?? selected.total) !== selected.total && (
                <div className="space-y-0.5 rounded-lg border border-emerald-700/30 bg-emerald-700/5 p-2.5 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{peso(selected.subtotal ?? selected.total)}</span></div>
                  <div className="flex justify-between font-semibold text-emerald-800"><span>Discount</span><span className="tabular-nums">−{peso(selected.discountAmount ?? 0)}</span></div>
                </div>
              )}
              {selected.note && <p className="text-sm"><b>Note:</b> {selected.note}</p>}

              {Object.values(selected.refunds ?? {}).length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-destructive/30 p-2.5 text-sm">
                  <p className="font-semibold text-destructive">Refunds</p>
                  {Object.values(selected.refunds!).map((r) => (
                    <div key={r.id} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{r.reason}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(r.createdAt)} · {r.approvedByName ?? "Owner/Manager"}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">−{peso(r.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-1">
                    <span className="font-semibold">Refundable now</span>
                    <span className="font-semibold tabular-nums">{peso(remainingRefundable(selected))}</span>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setReceiptOpen(true)}>
                  <Receipt /> Receipt
                </Button>
                {selected.status !== "cancelled" && remainingRefundable(selected) > 0.004 && (
                  <Button variant="outline" onClick={() => setRefundOpen(true)}>
                    <Undo2 /> Refund
                  </Button>
                )}
                {(selected.status === "pending" || selected.status === "preparing") && (
                  <Button variant="destructive" onClick={() => { if (confirm(`Cancel ${orderNo(selected)}? This can't be undone.`)) { updateOrderStatus(selected.id, "cancelled"); toast.success(`${orderNo(selected)} cancelled`) } }}>
                    Cancel order
                  </Button>
                )}
                {NEXT[selected.status] && <Button onClick={() => advance(selected.id, NEXT[selected.status]!.status, NEXT[selected.status]!.label)}>{NEXT[selected.status]!.label}</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <RefundDialog order={selected} open={refundOpen} onOpenChange={setRefundOpen} />
      <ReceiptDialog order={selected} open={receiptOpen} onOpenChange={setReceiptOpen} />
    </div>
  )
}
