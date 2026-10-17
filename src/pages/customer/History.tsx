import { useNavigate } from "react-router-dom"
import { History as HistoryIcon, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { StatusBadge } from "@/components/StatusBadge"
import { useStore } from "@/store/AppStore"
import { formatDateTime, orderNo, peso } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { OrderStatus } from "@/types"

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "pending", label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Picked up" },
]

function Progress({ status }: { status: OrderStatus }) {
  const idx = STEPS.findIndex((s) => s.key === status)
  return (
    <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label={`Order status: ${status}`}>
      {STEPS.map((s, i) => (
        <div key={s.key}>
          <div className={cn("h-1.5 rounded-full", i <= idx ? "bg-primary" : "bg-secondary")} />
          <p className={cn("mt-1 text-[11px]", i <= idx ? "font-semibold" : "text-muted-foreground")}>{s.label}</p>
        </div>
      ))}
    </div>
  )
}

export default function HistoryPage() {
  const { orders, currentUser, reorder } = useStore()
  const navigate = useNavigate()
  const mine = orders.filter((o) => o.customerId === currentUser?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  if (mine.length === 0)
    return (
      <div className="grid place-items-center gap-3 py-20 text-center">
        <HistoryIcon className="size-10 text-muted-foreground" />
        <p className="font-semibold">No orders yet</p>
        <p className="text-sm text-muted-foreground">Your past orders will show up here.</p>
        <Button onClick={() => navigate("/order")}>Order a drink</Button>
      </div>
    )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {mine.map((o) => (
        <Card key={o.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold">{orderNo(o)}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)} · {o.paymentMethod}</p>
            </div>
            <StatusBadge status={o.status} />
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {Object.values(o.items).map((i) => (
              <li key={i.menuItemId} className="flex justify-between"><span>{i.qty} × {i.name}</span><span>{peso(i.qty * i.price)}</span></li>
            ))}
          </ul>
          {o.note && <p className="mt-2 text-xs italic text-muted-foreground">Note: {o.note}</p>}
          {o.status !== "cancelled" && <Progress status={o.status} />}
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <p className="font-bold">Total {peso(o.total)}</p>
            <Button size="sm" variant="outline" onClick={() => { reorder(o); toast.success("Items added to your order"); navigate("/order") }}>
              <RotateCcw /> Order again
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
