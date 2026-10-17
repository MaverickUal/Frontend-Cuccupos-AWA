/**
 * Staff accounts only — customers are walk-ins and never sign in.
 *   admin   -> owner/manager (full dashboard, menu + staff management)
 *   cashier -> takes orders and records cash at the counter
 * These values are what lives in `users/<uid>/role` in the database, and the
 * security rules in src/lib/firebase_structure.md validate against them.
 */
export type Role = "cashier" | "admin"
export type Category = "Coffee" | "Milk Tea" | "Frappe" | "Others"
export type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled"

/**
 * The shop is cash-only for now. Widen this union (and the matching zod schema in
 * src/lib/actions.ts) if another tender type is added back.
 */
export type PaymentMethod = "Cash"

export interface User {
  id: string
  name: string
  email: string
  role: Role
  createdAt: string
}

export interface MenuItem {
  id: string
  name: string
  price: number
  description: string
  category: Category
  tag?: string
  image?: string
  available: boolean
}

export interface OrderItem {
  menuItemId: string
  name: string
  price: number
  qty: number
  category: Category
}

export interface Order {
  id: string
  /** Friendly order number ("ORD-…") generated at checkout. */
  displayId?: string
  customerId: string
  customerName: string
  items: Record<string, OrderItem>
  /**
   * Line-item sum before any discount. Optional: orders written before the
   * discount feature don't have it, and fall back to `total`.
   */
  subtotal?: number
  /** Concession applied at checkout, if any. Absent on pre-discount orders. */
  discountType?: DiscountType
  discountAmount?: number
  /** Amount actually payable: subtotal - discountAmount. */
  total: number
  paymentMethod: PaymentMethod
  /** Cash handed over by the customer. Cash-only shop, so this is always recorded. */
  cashTendered?: number
  /** Change returned to the customer: cashTendered - total. */
  changeGiven?: number
  status: OrderStatus
  createdAt: string
  note?: string
  /**
   * Refunds issued against this order, keyed by refund id.
   * Absent until a refund is recorded — the order itself is never deleted.
   */
  refunds?: Record<string, Refund>
  /** Running sum of completed refunds. Cached for cheap reads; recomputed by the backend. */
  refundedTotal?: number
}

/** Discount values live in src/lib/discounts.ts, which documents the assumptions. */
export type DiscountType = "none" | "pwd" | "senior"

export type RefundStatus = "completed"

/**
 * A completed refund. Refunds are append-only: there is no pending/approved split
 * because approval and execution both happen inside a backend transaction, so a
 * refund row only ever exists once the money has actually been handed back.
 */
export interface Refund {
  id: string
  orderId: string
  /** Order number shown to staff, for the audit trail. */
  orderDisplayId?: string
  amount: number
  reason: string
  status: RefundStatus
  createdAt: string
  /** Admin uid who approved and executed this refund. Set by the backend, never the client. */
  approvedBy: string
  approvedByName?: string
}

export interface CartLine {
  menuItemId: string
  qty: number
}
