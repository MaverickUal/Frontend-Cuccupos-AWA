/**
 * Builds the printable/PDF-able view of a single transaction.
 *
 * This is deliberately a pure function over exactly one order: it cannot reach into
 * the surrounding list, so there is no code path where "print" quietly exports the
 * whole orders table. Everything the DOM and the PDF renderer need comes out of here,
 * and it is unit-tested without a browser.
 *
 * Missing optional fields are handled by falling back, never by throwing: orders
 * written before discounts, refunds and display ids existed still have to print.
 */
import type { Order, Refund } from "@/types"
import { refundedOf, remainingRefundable } from "@/lib/finance"
import { formatDateTime, orderNo, peso } from "@/lib/format"

export const SHOP_NAME = "CuccuPOS"

export interface ReceiptLine {
  name: string
  qty: number
  unitPrice: number
  lineTotal: number
}

export interface ReceiptRefund {
  id: string
  createdAt: string
  amount: number
  reason: string
  approvedByName?: string
}

export interface Receipt {
  shopName: string
  heading: string
  orderNumber: string
  /** Formatted for display; kept separate from the raw value for the PDF. */
  dateTimeText: string
  createdAt: string
  cashierName: string
  status: string
  lines: ReceiptLine[]
  subtotal: number
  discountLabel: string
  discountAmount: number
  total: number
  paymentMethod: string
  cashTendered?: number
  changeGiven?: number
  refunds: ReceiptRefund[]
  refundedTotal: number
  remainingRefundable: number
}

/** Human label for a discount type; "none" collapses to no line at all. */
export function discountLabel(type?: string): string {
  switch (type) {
    case "pwd":
      return "PWD discount"
    case "senior":
      return "Senior Citizen discount"
    default:
      return "Discount"
  }
}

export function buildReceipt(order: Order): Receipt {
  const items = Object.values(order.items ?? {}).filter(Boolean)
  const lines: ReceiptLine[] = items.map((i) => ({
    name: i.name,
    qty: Number(i.qty ?? 0),
    unitPrice: Number(i.price ?? 0),
    lineTotal: Number((Number(i.price ?? 0) * Number(i.qty ?? 0)).toFixed(2)),
  }))

  // Orders predating the discount feature have no subtotal/discount fields. Their
  // subtotal is just the total, and no discount line is shown.
  const subtotal = typeof order.subtotal === "number" ? order.subtotal : order.total
  const discountAmount = typeof order.discountAmount === "number" ? order.discountAmount : 0
  const refundedTotal = refundedOf(order)

  const refunds: ReceiptRefund[] = Object.values<Refund>(order.refunds ?? {})
    .filter((r) => r?.status === "completed")
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      amount: Number(r.amount ?? 0),
      reason: r.reason,
      approvedByName: r.approvedByName,
    }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))

  return {
    shopName: SHOP_NAME,
    heading: "Transaction Receipt",
    orderNumber: orderNo(order),
    dateTimeText: formatDateTime(order.createdAt),
    createdAt: order.createdAt,
    cashierName: order.customerName || "Unknown",
    status: order.status,
    lines,
    subtotal,
    discountLabel: discountLabel(order.discountType),
    discountAmount,
    total: order.total,
    paymentMethod: order.paymentMethod,
    cashTendered: order.cashTendered,
    changeGiven: order.changeGiven,
    refunds,
    refundedTotal,
    remainingRefundable: remainingRefundable(order),
  }
}

/**
 * Download filename for the PDF. Built from the friendly order number so a cashier
 * filing receipts can find them, and stripped of anything a filesystem or a browser
 * download would object to (path separators, control characters, etc).
 */
export function receiptFilename(order: Order, extension = "pdf"): string {
  const raw = orderNo(order)
  const safe = raw.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "")
  return `receipt-${safe || order.id || "order"}.${extension}`
}

/** Formats a peso amount for the narrow receipt layout. Reuses the shared formatter. */
export const receiptMoney = (n: number) => peso(n)