import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/StatusBadge"
import { useStore } from "@/store/AppStore"
import { formatDateTime, peso } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { OrderStatus } from "@/types"

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  pending: { status: "preparing", label: "Start preparing" },
  preparing: { status: "ready", label: "Mark ready" },
  ready: { status: "completed", label: "Complete" },
}
const FILTERS: ("all" | OrderStatus)[] = ["all", "pending", "preparing", "ready", "completed", "cancelled"]
const label = (f: string) => (f === "all" ? "All" : f[0].toUpperCase() + f.slice(1))

export default function AdminOrders() {
  const { orders, updateOrderStatus } = useStore()
  const [filter, setFilter] = useState<"all" | OrderStatus>("all")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length }
    orders.forEach((o) => (c[o.status] = (c[o.status] ?? 0) + 1))
    return c
  }, [orders])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => (filter === "all" || o.status === filter) && (!q || o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)))
  }, [orders, filter, search])

  const selected = orders.find((o) => o.id === selectedId) ?? null

  function advance(id: string, status: OrderStatus, name: string) {
    updateOrderStatus(id, status)
    toast.success(`${id} · ${name}`)
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
          <Input aria-label="Search orders" className="pl-9" placeholder="Search by order ID or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Items</TableHead><TableHead>Placed</TableHead>
              <TableHead>Payment</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">No orders match these filters.</TableCell></TableRow>}
            {rows.slice(0, 100).map((o) => {
              const next = NEXT[o.status]
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">{o.id}</TableCell>
                  <TableCell>{o.customerName}</TableCell>
                  <TableCell className="max-w-[14rem] truncate text-muted-foreground">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</TableCell>
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
      {rows.length > 100 && <p className="text-center text-xs text-muted-foreground">Showing the latest 100 orders. Refine your search to see others.</p>}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.id}</DialogTitle>
                <DialogDescription>{selected.customerName} · {formatDateTime(selected.createdAt)} · {selected.paymentMethod}</DialogDescription>
              </DialogHeader>
              <StatusBadge status={selected.status} />
              <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
                {selected.items.map((i) => <div key={i.menuItemId} className="flex justify-between"><span>{i.qty} × {i.name}</span><span>{peso(i.qty * i.price)}</span></div>)}
                <div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{peso(selected.total)}</span></div>
              </div>
              {selected.note && <p className="text-sm"><b>Note:</b> {selected.note}</p>}
              <DialogFooter>
                {(selected.status === "pending" || selected.status === "preparing") && (
                  <Button variant="destructive" onClick={() => { if (confirm(`Cancel ${selected.id}? This can't be undone.`)) { updateOrderStatus(selected.id, "cancelled"); toast.success(`${selected.id} cancelled`) } }}>
                    Cancel order
                  </Button>
                )}
                {NEXT[selected.status] && <Button onClick={() => advance(selected.id, NEXT[selected.status]!.status, NEXT[selected.status]!.label)}>{NEXT[selected.status]!.label}</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
