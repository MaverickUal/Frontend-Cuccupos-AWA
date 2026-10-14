import type { MenuItem, Order, OrderStatus, PaymentMethod, User } from "@/types"

export const seedUsers: User[] = [
  { id: "u_admin", name: "Owner/Manager", email: "admin@cuccu.test", password: "admin123", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "u_customer", name: "Juan Dela Cruz", email: "customer@cuccu.test", password: "password123", role: "customer", createdAt: "2026-01-05T00:00:00.000Z" },
]

// Drop matching photos into /public/menu/ (e.g. iced-americano.jpg). A placeholder shows if the file is missing.
export const seedMenu: MenuItem[] = [
  { id: "m_1", name: "Iced Americano", price: 80, description: "Pure espresso with chilled water.", category: "Coffee", image: "/menu/iced-americano.jpg", available: true },
  { id: "m_2", name: "Classic Milk Tea", price: 95, description: "Smooth and creamy milk tea.", category: "Milk Tea", image: "/menu/classic-milk-tea.jpg", available: true },
  { id: "m_3", name: "Spanish Latte", price: 100, description: "Espresso with condensed milk.", category: "Coffee", image: "/menu/spanish-latte.jpg", available: true },
  { id: "m_4", name: "Wintermelon Milk Tea", price: 100, description: "Refreshing wintermelon flavor.", category: "Milk Tea", image: "/menu/wintermelon-milk-tea.jpg", available: true },
  { id: "m_5", name: "Caramel Macchiato", price: 100, description: "Espresso with vanilla syrup, and caramel drizzle", category: "Coffee", image: "/menu/caramel-macchiato.jpg", available: true },
  { id: "m_6", name: "Matcha", price: 105, description: "Premium matcha with fresh milk.", category: "Others", tag: "Non-coffee", image: "/menu/matcha.jpg", available: true },
  { id: "m_7", name: "Mocha Frappe", price: 110, description: "Blended coffee and chocolate topped with whipped cream", category: "Frappe", image: "/menu/mocha-frappe.jpg", available: true },
  { id: "m_8", name: "Taro Milk Tea", price: 95, description: "Creamy taro with fresh milk and tapioca pearls", category: "Milk Tea", image: "/menu/taro-milk-tea.jpg", available: true },
  { id: "m_9", name: "Java Chip Frappe", price: 110, description: "Blended coffee with chocolate chips.", category: "Frappe", image: "/menu/java-chip-frappe.jpg", available: true },
  { id: "m_10", name: "Caramel Frappe", price: 110, description: "Rich caramel flavor with whipped cream.", category: "Frappe", image: "/menu/caramel-frappe.jpg", available: true },
]

function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const people = [
  { id: "u_customer", name: "Juan Dela Cruz" },
  { id: "c_maria", name: "Maria Santos" },
  { id: "c_paolo", name: "Paolo Reyes" },
  { id: "c_ana", name: "Ana Villanueva" },
  { id: "c_kyle", name: "Kyle Mendoza" },
  { id: "c_bea", name: "Bea Lim" },
]
const methods: PaymentMethod[] = ["Cash", "GCash", "Card"]

/** Generates ~2 weeks of fake orders so the dashboard and reports have something to show. */
export function generateSeedOrders(): Order[] {
  const rand = mulberry32(2026)
  const now = new Date()
  const minsToday = now.getHours() * 60 + now.getMinutes()
  const raw: Omit<Order, "id" | "status">[] = []

  for (let d = 13; d >= 0; d--) {
    const count = d === 0 ? 5 : 5 + Math.floor(rand() * 7)
    for (let i = 0; i < count; i++) {
      let date: Date
      if (d === 0) {
        date = new Date(now.getTime() - (1 + Math.floor(rand() * Math.max(1, minsToday - 1))) * 60000)
      } else {
        date = new Date(now)
        date.setDate(now.getDate() - d)
        date.setHours(8 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0)
      }
      const lineCount = 1 + Math.floor(rand() * 3)
      const picked = new Set<number>()
      while (picked.size < lineCount) picked.add(Math.floor(rand() * seedMenu.length))
      const items = [...picked].map((idx) => {
        const m = seedMenu[idx]
        return { menuItemId: m.id, name: m.name, price: m.price, qty: 1 + Math.floor(rand() * 2), category: m.category }
      })
      const person = people[Math.floor(rand() * people.length)]
      raw.push({
        customerId: person.id,
        customerName: person.name,
        items,
        total: items.reduce((s, it) => s + it.price * it.qty, 0),
        paymentMethod: methods[Math.floor(rand() * methods.length)],
        createdAt: date.toISOString(),
      })
    }
  }

  raw.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const n = raw.length
  const orders: Order[] = raw.map((o, i) => {
    let status: OrderStatus = rand() < 0.04 ? "cancelled" : "completed"
    if (i === n - 1) status = "pending"
    else if (i === n - 2) status = "preparing"
    else if (i === n - 3) status = "ready"
    return { ...o, id: `ORD-${1001 + i}`, status }
  })
  return orders.reverse() // newest first
}
