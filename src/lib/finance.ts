/**
 * Financial aggregation for reports and dashboard.
 *
 * Three figures are kept distinct so nothing is silently overwritten:
 *   gross  — what the customer was originally billed (order.total)
 *   refund — money handed back
 *   net    — gross minus refunds, i.e. what the shop actually kept
 *
 * `gross` is read from `order.total`, which is already the discounted payable
 * amount. Discounts therefore reduce gross rather than appearing as a second
 * subtraction, so a discount is never double-counted.
 */
import type { Order, Refund } from "@/types"
import { validOrders } from "@/lib/stats"

const r2 = (n: number) => Math.round(n * 100) / 100

/** Sum of completed refunds on an order, preferring the cached running total. */
export function refundedOf(o: Pick<Order, "refunds" | "refundedTotal">): number {
  const fromRecords = Object.values(o.refunds ?? {})
    .filter((r) => r?.status === "completed")
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
  const cached = typeof o.refundedTotal === "number" ? o.refundedTotal : 0
  // Take the larger of the two: a partially migrated order can't under-report.
  return r2(Math.max(cached, fromRecords))
}

export function remainingRefundable(o: Order): number {
  return r2(Math.max(0, Number(o.total ?? 0) - refundedOf(o)))
}

export interface Totals {
  gross: number
  refunds: number
  net: number
  orders: number
  itemsSold: number
  cancelled: number
  avgOrder: number
  discountGiven: number
  cashCollected: number
  changeGiven: number
}

export function totalsFor(orders: Order[], scoped: Order[]): Totals {
  const sales = validOrders(scoped)
  const gross = r2(sales.reduce((s, o) => s + Number(o.total ?? 0), 0))
  const refunds = r2(sales.reduce((s, o) => s + refundedOf(o), 0))
  const discountGiven = r2(
    sales.reduce((s, o) => s + Number(o.discountAmount ?? 0), 0)
  )
  return {
    gross,
    refunds,
    net: r2(gross - refunds),
    orders: sales.length,
    itemsSold: sales.reduce((s, o) => s + Object.values(o.items).reduce((n, i) => n + i.qty, 0), 0),
    cancelled: orders.length - sales.length,
    avgOrder: sales.length ? r2(gross / sales.length) : 0,
    discountGiven,
    cashCollected: r2(sales.reduce((s, o) => s + (o.cashTendered ?? o.total), 0)),
    changeGiven: r2(sales.reduce((s, o) => s + (o.changeGiven ?? 0), 0)),
  }
}

export interface RefundRow {
  id: string
  orderId: string
  orderDisplayId?: string
  cashierName: string
  amount: number
  reason: string
  createdAt: string
  approvedBy: string
  approvedByName?: string
}

/** Flattened refund history for an audit view, newest first. */
export function refundRows(orders: Order[]): RefundRow[] {
  const rows: RefundRow[] = []
  for (const o of orders) {
    for (const r of Object.values<Refund>(o.refunds ?? {})) {
      if (!r || r.status !== "completed") continue
      rows.push({
        id: r.id,
        orderId: o.id,
        orderDisplayId: o.displayId,
        cashierName: o.customerName,
        amount: Number(r.amount ?? 0),
        reason: r.reason,
        createdAt: r.createdAt,
        approvedBy: r.approvedBy,
        approvedByName: r.approvedByName,
      })
    }
  }
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}