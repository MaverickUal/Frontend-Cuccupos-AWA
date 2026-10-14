export type Role = "customer" | "admin"
export type Category = "Coffee" | "Milk Tea" | "Frappe" | "Others"
export type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled"
export type PaymentMethod = "Cash" | "GCash" | "Card"

export interface User {
  id: string
  name: string
  email: string
  password: string // mock only. The real backend must hash passwords.
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
  customerId: string
  customerName: string
  items: OrderItem[]
  total: number
  paymentMethod: PaymentMethod
  status: OrderStatus
  createdAt: string
  note?: string
}

export interface CartLine {
  menuItemId: string
  qty: number
}
