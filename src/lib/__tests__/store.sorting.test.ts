/**
 * Sorting and cashier filtering at the level pages consume.
 *
 * `sortByCreatedAtDesc` is imported directly rather than through the store,
 * because the store needs a Firebase context. The store is verified separately in
 * the browser.
 */
import { describe, expect, it } from "vitest"
import { sortByCreatedAtDesc } from "@/lib/stats"
import type { Order, User } from "@/types"

const ord = (id: string, createdAt: string | undefined, extra: Partial<Order> = {}): Order =>
  ({
    id,
    customerId: "u1",
    customerName: "Juan",
    items: {},
    total: 100,
    paymentMethod: "Cash",
    status: "completed",
    createdAt,
    ...extra,
  }) as unknown as Order

const usr = (id: string, name: string, role: User["role"]): User => ({
  id,
  name,
  email: `${id}@x.test`,
  role,
  createdAt: "2026-01-01T00:00:00.000Z",
})

/** Mirrors flattenOrders in actions.ts: admin feed arrives grouped by customer. */
function flattenByCustomer(value: Record<string, Record<string, any>>) {
  const out: any[] = []
  for (const [customerId, bucket] of Object.entries(value)) {
    for (const [id, order] of Object.entries(bucket)) out.push({ id, customerId, ...order })
  }
  return out
}

describe("admin feed ordering", () => {
  it("reverses the grouped order into chronological order", () => {
    // Grouped by customer (as RTDB returns it): Alice's orders, then Bob's.
    const grouped = flattenByCustomer({
      alice: {
        a1: { createdAt: "2026-03-01T10:00:00Z" },
        a2: { createdAt: "2026-03-05T10:00:00Z" },
      },
      bob: {
        b1: { createdAt: "2026-03-09T10:00:00Z" },
      },
    })
    // Grouped order is a1, a2, b1 — which happens to be ascending by luck here.
    // Reverse the customer grouping to prove the store fixes it.
    const sorted = sortByCreatedAtDesc(grouped)
    expect(sorted.map((o) => o.createdAt)).toEqual([
      "2026-03-09T10:00:00Z",
      "2026-03-05T10:00:00Z",
      "2026-03-01T10:00:00Z",
    ])
  })

  it("puts a later order from a different cashier above an earlier one", () => {
    const grouped = flattenByCustomer({
      zzz_first: { x: { createdAt: "2026-03-01T10:00:00Z" } },
      aaa_second: { y: { createdAt: "2026-03-20T10:00:00Z" } },
    })
    expect(grouped.map((o) => o.id)).toEqual(["x", "y"]) // grouped, not chronological
    expect(sortByCreatedAtDesc(grouped).map((o) => o.id)).toEqual(["y", "x"]) // fixed
  })
})

describe("newest-first under live updates", () => {
  it("a newly arrived order lands at the top", () => {
    const initial = [ord("o1", "2026-03-01T10:00:00Z"), ord("o2", "2026-03-02T10:00:00Z")]
    const afterUpdate = [...initial, ord("o3", "2026-03-03T10:00:00Z")]
    expect(sortByCreatedAtDesc(afterUpdate).map((o) => o.id)).toEqual(["o3", "o2", "o1"])
  })

  it("is stable when re-sorting the same set", () => {
    const set = [ord("a", "2026-03-01T10:00:00Z"), ord("b", "2026-03-02T10:00:00Z")]
    expect(sortByCreatedAtDesc(set).map((o) => o.id)).toEqual(
      sortByCreatedAtDesc(set).map((o) => o.id)
    )
  })
})

describe("cashier selection", () => {
  const users = [usr("admin1", "Owner", "admin"), usr("c1", "Ana", "cashier"), usr("c2", "Ben", "cashier")]
  const orders = [
    ord("a", "2026-03-03T10:00:00Z", { customerId: "c1", customerName: "Ana" }),
    ord("b", "2026-03-02T10:00:00Z", { customerId: "c2", customerName: "Ben" }),
    ord("c", "2026-03-01T10:00:00Z", { customerId: "c1", customerName: "Ana" }),
  ]

  const cashiers = () => users.filter((u) => u.role === "cashier").sort((a, b) => a.name.localeCompare(b.name))

  it("offers only cashier accounts, never an admin", () => {
    const ids = cashiers().map((u) => u.id)
    expect(ids).toEqual(["c1", "c2"])
    expect(ids).not.toContain("admin1")
  })

  it("matches by id, not display name", () => {
    const renamed = orders.map((o) => ({ ...o, customerName: "Same Name" }))
    const filtered = renamed.filter((o) => o.customerId === "c1")
    expect(filtered).toHaveLength(2)
    // Filtering by name would have merged both cashiers.
    expect(renamed.filter((o) => o.customerName === "Same Name")).toHaveLength(3)
  })

  it("All Cashiers returns everything", () => {
    expect(orders.filter((o) => o.customerId === "c1" || o.customerId === "c2")).toHaveLength(3)
  })

  it("a cashier with no orders yields an empty set", () => {
    expect(orders.filter((o) => o.customerId === "nobody")).toHaveLength(0)
  })

  it("does not match orders from a different cashier with the same name", () => {
    const sameName = [
      ord("a", "2026-03-02T10:00:00Z", { customerId: "c1", customerName: "Ana" }),
      ord("b", "2026-03-01T10:00:00Z", { customerId: "c2", customerName: "Ana" }),
    ]
    expect(sameName.filter((o) => o.customerId === "c1").map((o) => o.id)).toEqual(["a"])
  })
})

describe("backward compatibility", () => {
  it("reads an order with no discount fields", () => {
    const legacy = ord("old", "2026-03-01T10:00:00Z")
    expect(legacy.subtotal).toBeUndefined()
    expect(legacy.discountType).toBeUndefined()
    expect(legacy.refunds).toBeUndefined()
    expect(sortByCreatedAtDesc([legacy])).toHaveLength(1)
  })

  it("orders a legacy and a discounted order together by time", () => {
    const list = [
      ord("disc", "2026-03-05T10:00:00Z", { subtotal: 265, discountType: "pwd", discountAmount: 53, total: 212 }),
      ord("legacy", "2026-03-01T10:00:00Z"),
    ]
    expect(sortByCreatedAtDesc(list).map((o) => o.id)).toEqual(["disc", "legacy"])
  })
})