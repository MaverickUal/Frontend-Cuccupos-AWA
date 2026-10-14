import { Badge } from "@/components/ui/badge"
import type { OrderStatus } from "@/types"

const map: Record<OrderStatus, { label: string; variant: "warning" | "info" | "default" | "success" | "destructive" }> = {
  pending: { label: "Pending", variant: "warning" },
  preparing: { label: "Preparing", variant: "info" },
  ready: { label: "Ready for pickup", variant: "default" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const m = map[status]
  return <Badge variant={m.variant}>{m.label}</Badge>
}
