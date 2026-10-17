import { useEffect, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStore } from "@/store/AppStore"
import { orderNo, peso, formatDateTime } from "@/lib/format"
import { remainingRefundable, refundedOf } from "@/lib/finance"
import type { Order } from "@/types"

/**
 * Refund dialog for the Owner/Manager.
 *
 * Approval and execution both happen inside the `refundOrder` Cloud Function,
 * because the remaining-amount check must be atomic and `approvedBy` must come
 * from the verified session. This dialog never writes refund data itself — if the
 * function isn't deployed, it says so instead of implying cash was returned.
 */
export function RefundDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { refundOrder, currentUser } = useStore()
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    const remaining = order ? remainingRefundable(order) : 0
    setAmount(String(remaining))
    setReason("")
    setError("")
  }, [open, order])

  if (!order) return null

  const remaining = remainingRefundable(order)
  const already = refundedOf(order)
  const entered = Number(amount)
  const amountValid = Number.isFinite(entered) && entered > 0 && entered <= remaining + 0.004
  const reasonValid = reason.trim().length >= 3
  const fullyRefunded = remaining <= 0.004

  async function submit() {
    setBusy(true)
    setError("")
    const res = await refundOrder(order!.id, entered, reason.trim())
    setBusy(false)
    if (!res.success) {
      setError(res.message)
      toast.error(res.message)
      return
    }
    toast.success(`${orderNo(order!)} · ${peso(entered)} refunded`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-5" /> Refund {orderNo(order)}
          </DialogTitle>
          <DialogDescription>
            Approved by {currentUser?.name ?? "you"}. This records that cash was handed back and updates the
            financial reports. The original order and its history are kept.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span>Order total</span>
            <span className="font-semibold tabular-nums">{peso(order.total)}</span>
          </div>
          {already > 0 && (
            <div className="flex justify-between">
              <span>Already refunded</span>
              <span className="font-semibold tabular-nums text-destructive">−{peso(already)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1 font-bold">
            <span>Refundable now</span>
            <span className="tabular-nums">{peso(remaining)}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Placed {formatDateTime(order.createdAt)} by {order.customerName}
          </p>
        </div>

        {fullyRefunded ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            This order has already been fully refunded. There is nothing left to return.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Refund amount</Label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                min={0}
                max={remaining}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                className="tabular-nums"
                aria-describedby="refund-amount-help"
              />
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant="outline"
                  className="cursor-pointer select-none"
                  onClick={() => setAmount(String(remaining))}
                >
                  Full {peso(remaining)}
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer select-none"
                  onClick={() => setAmount(String(Math.round(remaining / 2)))}
                >
                  Half {peso(Math.round(remaining / 2))}
                </Badge>
              </div>
              <p id="refund-amount-help" className="text-xs text-muted-foreground">
                Maximum {peso(remaining)}. Partial refunds are allowed.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Reason</Label>
              <Input
                id="refund-reason"
                placeholder="Wrong drink made, customer changed mind…"
                maxLength={160}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                Stored with your name and the time for the audit trail.
              </p>
            </div>
          </>
        )}

        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={busy || fullyRefunded || !amountValid || !reasonValid}
          >
            {busy ? <><Loader2 className="animate-spin" /> Processing…</> : `Confirm refund${amountValid ? ` of ${peso(entered)}` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}