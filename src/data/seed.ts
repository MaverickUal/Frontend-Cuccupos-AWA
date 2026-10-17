import type { MenuItem, Order, User } from "@/types"

/**
 * Shape reference only — these records are never written to Firebase and no
 * credentials live in this repository. Provision real accounts from
 * /admin/cashiers, or set `users/<uid>/role` to "admin" by hand for the first
 * administrator.
 */
export const seedUsers: User[] = [
  { id: "u_admin", name: "Owner/Manager", email: "", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "u_cashier", name: "", email: "", role: "cashier", createdAt: "2026-01-05T00:00:00.000Z" },
]


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


export function generateSeedOrders(): Order[] {
  return []
}
