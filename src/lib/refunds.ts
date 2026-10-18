/**
 * Pure refund logic shared by the UI and the RTDB transaction.
 *
 * The money maths deliberately mirrors `finance.ts` so a refund can never be
 * approved for more than the order actually paid. This module has no Firebase
 * import, so it is fast and deterministic to test.
 */
import type { Order, Refund } from "@/types"

const r2 = (n: number) => Math.round(n * 100) / 100

export const EPSILON = 0.004

export function refundedOf(order: Pick<Order, "refunds" | "refundedTotal">): number {
  const fromRecords = Object.values(order.refunds ?? {})
    .filter((r) => r?.status === "completed")
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
  const cached = typeof order.refundedTotal === "number" ? order.refundedTotal : 0
  return r2(Math.max(cached, fromRecords))
}

export function remainingRefundable(order: Order): number {
  return r2(Math.max(0, Number(order.total ?? 0) - refundedOf(order)))
}

export interface RefundRequest {
  amount: number
  reason: string
}

export interface RefundApprover {
  uid: string
  name?: string
}

/**
 * Validate and apply a refund to an order, returning the new order record.
 *
 * Throws an Error with a user-facing message on any validation failure so the
 * caller (UI or transaction) can surface it without re-deriving the rule.
 */
export function applyRefund(
  order: Order,
  request: RefundRequest,
  approver: RefundApprover,
  now: string = new Date().toISOString()
): Order {
  const reason = String(request.reason ?? "").trim()
  if (reason.length < 3) {
    throw new Error("A refund reason of at least 3 characters is required.")
  }

  const amount = r2(Number(request.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Refund amount must be greater than zero.")
  }

  if (order.status === "cancelled") {
    throw new Error("A cancelled order cannot be refunded.")
  }

  const already = refundedOf(order)
  const paid = r2(Number(order.total ?? 0))
  const remaining = r2(paid - already)

  if (remaining <= EPSILON) {
    throw new Error("This order has already been fully refunded.")
  }
  if (amount > remaining + EPSILON) {
    throw new Error(`Refund exceeds the amount remaining. Maximum refundable is ${remaining.toFixed(2)}.`)
  }

  const refundId = `refund_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const record: Refund = {
    id: refundId,
    orderId: order.id,
    orderDisplayId: order.displayId,
    amount,
    reason,
    status: "completed",
    createdAt: now,
    approvedBy: approver.uid,
    approvedByName: approver.name,
  }

  const refunds = { ...(order.refunds ?? {}), [refundId]: record }
  return {
    ...order,
    refunds,
    refundedTotal: r2(already + amount),
  }
}