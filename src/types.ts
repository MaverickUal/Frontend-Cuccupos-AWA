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
  total: number
  paymentMethod: PaymentMethod
  /** Cash handed over by the customer. Cash-only shop, so this is always recorded. */
  cashTendered?: number
  /** Change returned to the customer: cashTendered - total. */
  changeGiven?: number
  status: OrderStatus
  createdAt: string
  note?: string
}

export interface CartLine {
  menuItemId: string
  qty: number
}
