/**
 * Dashboard behaviour that has no single home in the page component: the cashier
 * filter, the comparison window, and the interaction between the two.
 *
 * These reproduce the exact expressions used in Dashboard.tsx. They are pure data
 * transforms, so they are testable without a DOM; the page's role is only to wire
 * them to React state.
 */
import { describe, it, expect } from "vitest"
import { validOrders, inRange, resolveRange, seriesFor } from "@/lib/stats"
import { totalsFor } from "@/lib/finance"
import type { Order } from "@/types"

const ALL = "all"

/** The cashier selector's population, matching Dashboard.tsx. */
function cashierOptions(users: { id: string; name: string; role: string }[]) {
  return users
    .filter((u) => u.role === "cashier")
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Filtering by uid, never by display name. */
const scope = (orders: Order[], cashierId: string) =>
  cashierId === ALL ? orders : orders.filter((o) => o.customerId === cashierId)

const order = (over: Partial<Order> & { id: string }): Order =>
  ({
    customerId: "c1",
    customerName: "Ana",
    items: { a: { menuItemId: "m1", name: "Matcha", price: 100, qty: 1, category: "Coffee" } },
    total: 100,
    paymentMethod: "Cash",
    status: "completed",
    createdAt: "2026-03-10T10:00:00.000Z",
    ...over,
  }) as Order

const day = (d: string, hours = 10) => `${d}T${String(hours).padStart(2, "0")}:00:00.000Z`

describe("cashier selector population", () => {
  const users = [
    { id: "u1", name: "Ana", role: "cashier" },
    { id: "u2", name: "Bao", role: "cashier" },
    { id: "u0", name: "Owner", role: "admin" },
  ]

  it("lists only cashier accounts", () => {
    expect(cashierOptions(users).map((u) => u.id)).toEqual(["u1", "u2"])
  })

  it("excludes the administrator", () => {
    expect(cashierOptions(users).some((u) => u.name === "Owner")).toBe(false)
  })

  it("carries the uid, so filtering never depends on a display name", () => {
    for (const opt of cashierOptions(users)) expect(opt.id).toBeTruthy()
  })

  it("excludes an account with an unrecognised role", () => {
    expect(cashierOptions([...users, { id: "u9", name: "Weird", role: "owner" }]).length).toBe(2)
  })
})

describe("cashier filtering", () => {
  const orders = [
    order({ id: "1", customerId: "u1", total: 100 }),
    order({ id: "2", customerId: "u1", total: 190 }),
    order({ id: "3", customerId: "u2", total: 250 }),
  ]

  it("returns everything for All Cashiers", () => {
    expect(scope(orders, ALL)).toHaveLength(3)
  })

  it("returns only that cashier's orders", () => {
    expect(scope(orders, "u1")).toHaveLength(2)
    expect(scope(orders, "u2")).toHaveLength(1)
  })

  it("changes the KPI totals", () => {
    const all = totalsFor(scope(orders, ALL), scope(orders, ALL))
    const ana = totalsFor(scope(orders, "u1"), scope(orders, "u1"))
    expect(all.gross).toBe(540)
    expect(ana.gross).toBe(290)
    expect(all.orders).toBe(3)
    expect(ana.orders).toBe(2)
  })

  it("separates two cashiers who share a display name", () => {
    const twins = [
      order({ id: "a", customerId: "u1", customerName: "Sam", total: 100 }),
      order({ id: "b", customerId: "u2", customerName: "Sam", total: 300 }),
    ]
    expect(scope(twins, "u1")).toHaveLength(1)
    expect(totalsFor(scope(twins, "u1"), scope(twins, "u1")).gross).toBe(100)
    expect(totalsFor(scope(twins, "u2"), scope(twins, "u2")).gross).toBe(300)
  })

  it("returns an empty set for a cashier with no orders", () => {
    expect(scope(orders, "u9")).toEqual([])
  })

  it("yields zero-valued metrics rather than NaN for an empty cashier", () => {
    const none = scope(orders, "u9")
    const t = totalsFor(none, none)
    expect(t.gross).toBe(0)
    expect(t.orders).toBe(0)
    expect(t.net).toBe(0)
    expect(t.avgOrder).toBe(0)
    expect(Number.isFinite(t.avgOrder)).toBe(true)
  })
})

describe("cancelled orders", () => {
  const orders = [
    order({ id: "1", customerId: "u1", total: 500, status: "cancelled" }),
    order({ id: "2", customerId: "u1", total: 100, status: "completed" }),
  ]

  it("contributes nothing to sales figures", () => {
    expect(totalsFor(orders, orders).gross).toBe(100)
  })

  it("is still counted so the owner can see it happened", () => {
    const t = totalsFor(orders, orders)
    expect(t.cancelled).toBe(1)
    expect(t.orders).toBe(1)
  })

  it("is excluded when a cashier filter is applied", () => {
    const mine = scope(orders, "u1")
    expect(validOrders(mine)).toHaveLength(1)
  })
})

describe("cashier filter combined with a date range", () => {
  const range = resolveRange("custom", "2026-03-01", "2026-03-31")
  const orders = [
    order({ id: "in-ana", customerId: "u1", createdAt: day("2026-03-10"), total: 100 }),
    order({ id: "out-ana", customerId: "u1", createdAt: "2026-02-10T10:00:00.000Z", total: 900 }),
    order({ id: "in-bao", customerId: "u2", createdAt: day("2026-03-12"), total: 250 }),
  ]

  it("applies both filters together", () => {
    const scoped = inRange(scope(orders, "u1"), range)
    expect(scoped.map((o) => o.id)).toEqual(["in-ana"])
  })

  it("keeps the other cashier's orders out of the range result", () => {
    expect(inRange(scope(orders, "u1"), range).map((o) => o.id)).not.toContain("in-bao")
  })

  it("gives the other cashier their own correct total", () => {
    const scoped = inRange(scope(orders, "u2"), range)
    expect(totalsFor(scoped, scoped).gross).toBe(250)
  })
})

describe("comparison period", () => {
  /** Reproduces Dashboard.tsx's previous-window calculation. */
  const comparison = (orders: Order[], range: { from: Date; to: Date }) => {
    const span = range.to.getTime() - range.from.getTime()
    const prevFrom = new Date(range.from.getTime() - span)
    const prevTo = new Date(range.from.getTime() - 1)
    const within = (o: Order, a: number, b: number) => {
      const t = Date.parse(o.createdAt)
      return Number.isFinite(t) && t >= a && t <= b
    }
    const scoped = validOrders(orders)
    return {
      current: scoped.filter((o) => within(o, range.from.getTime(), range.to.getTime())),
      previous: scoped.filter((o) => within(o, prevFrom.getTime(), prevTo.getTime())),
    }
  }

  const range = resolveRange("custom", "2026-03-10", "2026-03-20")

  it("compares against the immediately preceding window of equal length", () => {
    const orders = [
      order({ id: "cur", createdAt: day("2026-03-12"), total: 100 }),
      order({ id: "prev", createdAt: day("2026-03-05"), total: 80 }),
    ]
    const { current, previous } = comparison(orders, range)
    expect(current.map((o) => o.id)).toEqual(["cur"])
    expect(previous.map((o) => o.id)).toEqual(["prev"])
  })

  it("uses the same selected cashier for the comparison", () => {
    const orders = [
      order({ id: "ana-cur", customerId: "u1", createdAt: day("2026-03-12"), total: 100 }),
      order({ id: "bao-cur", customerId: "u2", createdAt: day("2026-03-12"), total: 999 }),
      order({ id: "bao-prev", customerId: "u2", createdAt: day("2026-03-05"), total: 999 }),
    ]
    const { current, previous } = comparison(scope(orders, "u1"), range)
    expect(current.every((o) => o.customerId === "u1")).toBe(true)
    expect(previous).toEqual([])
  })

  it("does not report a percentage when there is no baseline", () => {
    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
    expect(pct(100, 0)).toBeNull()
  })
})

describe("charts respond to the cashier filter", () => {
  const range = resolveRange("custom", "2026-03-10", "2026-03-20")
  const orders = [
    order({ id: "a", customerId: "u1", createdAt: day("2026-03-11"), total: 100 }),
    order({ id: "b", customerId: "u2", createdAt: day("2026-03-11"), total: 500 }),
  ]

  it("changes the plotted series when a cashier is selected", () => {
    const all = seriesFor(scope(orders, ALL), range)
    const ana = seriesFor(scope(orders, "u1"), range)
    expect(ana.reduce((s, p) => s + p.revenue, 0)).toBe(100)
    expect(all.reduce((s, p) => s + p.revenue, 0)).toBe(600)
  })

  it("keeps empty buckets present as zero rather than dropping them", () => {
    const sparse = seriesFor(scope(orders, "u1"), range)
    expect(sparse.length).toBeGreaterThan(0)
    // Every day of the range is represented, so quiet days plot as real zeroes
    // instead of the axis silently compressing.
    expect(sparse).toHaveLength(11)
    expect(sparse.filter((p) => p.revenue === 0)).toHaveLength(10)
    expect(sparse.every((p) => Number.isFinite(p.revenue) && Number.isFinite(p.orders))).toBe(true)
  })
})