import type { Order } from "@/types"

export const startOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
export const validOrders = (orders: Order[]) => orders.filter((o) => o.status !== "cancelled")
export const sumTotal = (orders: Order[]) => orders.reduce((s, o) => s + o.total, 0)

export function dailySeries(orders: Order[], days: number) {
  const today = startOfDay(new Date())
  const valid = validOrders(orders)
  const out: { label: string; revenue: number; orders: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const next = new Date(d)
    next.setDate(d.getDate() + 1)
    const inDay = valid.filter((o) => {
      const t = new Date(o.createdAt)
      return t >= d && t < next
    })
    out.push({
      label: d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
      revenue: sumTotal(inDay),
      orders: inDay.length,
    })
  }
  return out
}

export function topItems(orders: Order[], limit = 5) {
  const m = new Map<string, { name: string; qty: number; revenue: number }>()
  validOrders(orders).forEach((o) =>
    o.items.forEach((i) => {
      const r = m.get(i.menuItemId) ?? { name: i.name, qty: 0, revenue: 0 }
      r.qty += i.qty
      r.revenue += i.qty * i.price
      m.set(i.menuItemId, r)
    })
  )
  return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, limit)
}

export function byCategory(orders: Order[]) {
  const m = new Map<string, { category: string; qty: number; revenue: number }>()
  validOrders(orders).forEach((o) =>
    o.items.forEach((i) => {
      const r = m.get(i.category) ?? { category: i.category, qty: 0, revenue: 0 }
      r.qty += i.qty
      r.revenue += i.qty * i.price
      m.set(i.category, r)
    })
  )
  return [...m.values()].sort((a, b) => b.revenue - a.revenue)
}

export function byPayment(orders: Order[]) {
  const m = new Map<string, { method: string; orders: number; revenue: number }>()
  validOrders(orders).forEach((o) => {
    const r = m.get(o.paymentMethod) ?? { method: o.paymentMethod, orders: 0, revenue: 0 }
    r.orders += 1
    r.revenue += o.total
    m.set(o.paymentMethod, r)
  })
  return [...m.values()].sort((a, b) => b.revenue - a.revenue)
}
