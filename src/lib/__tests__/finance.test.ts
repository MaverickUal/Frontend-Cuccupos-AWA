/**
 * Refund accounting: gross vs refunds vs net, duplicate prevention, and the
 * invariant that refunds never exceed what was paid.
 */
import { describe, expect, it } from "vitest"
import { refundRows, refundedOf, remainingRefundable, totalsFor } from "@/lib/finance"
import type { Order, Refund } from "@/types"

const mkOrder = (extra: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    displayId: "ORD-1",
    customerId: "u1",
    customerName: "Juan",
    items: { m_1: { menuItemId: "m_1", name: "Latte", price: 100, qty: 1, category: "Coffee" } },
    total: 100,
    paymentMethod: "Cash",
    status: "completed",
    createdAt: "2026-03-08T10:00:00.000Z",
    ...extra,
  }) as Order

const refund = (over: Partial<Refund> = {}): Refund => ({
  id: "r1",
  orderId: "o1",
  amount: 50,
  reason: "spilled drink",
  status: "completed",
  createdAt: "2026-03-08T11:00:00.000Z",
  approvedBy: "admin1",
  ...over,
})

describe("refundedOf", () => {
  it("is zero with no refunds", () => {
    expect(refundedOf(mkOrder())).toBe(0)
    expect(refundedOf({ refundedTotal: undefined })).toBe(0)
  })

  it("sums completed refund records", () => {
    const o = mkOrder({
      refunds: { r1: refund({ amount: 30 }), r2: refund({ id: "r2", amount: 20 }) },
    })
    expect(refundedOf(o)).toBe(50)
  })

  it("ignores non-completed refunds", () => {
    const o = mkOrder({
      refunds: { r1: refund({ amount: 30, status: "pending" as any }) },
    })
    expect(refundedOf(o)).toBe(0)
  })

  it("trusts the larger of cached total vs records", () => {
    const o = mkOrder({ refunds: { r1: refund({ amount: 30 }) }, refundedTotal: 80 })
    expect(refundedOf(o)).toBe(80)
  })

  it("recovers when the cached total is missing", () => {
    const o = mkOrder({ refunds: { r1: refund({ amount: 40 }) } })
    expect(refundedOf(o)).toBe(40)
  })
})

describe("remainingRefundable", () => {
  it("equals the paid total when nothing is refunded", () => {
    expect(remainingRefundable(mkOrder({ total: 265 }))).toBe(265)
  })

  it("subtracts refunds already issued", () => {
    const o = mkOrder({ total: 265, refunds: { r1: refund({ amount: 65 }) } })
    expect(remainingRefundable(o)).toBe(200)
  })

  it("never goes negative on an over-refunded record", () => {
    const o = mkOrder({ total: 100, refunds: { r1: refund({ amount: 150 }) } })
    expect(remainingRefundable(o)).toBe(0)
  })

  it("allows a second refund up to the remainder", () => {
    const o = mkOrder({ total: 100, refunds: { r1: refund({ amount: 60 }) } })
    expect(remainingRefundable(o)).toBe(40)
  })

  it("blocks a duplicate full refund", () => {
    const o = mkOrder({ total: 100, refunds: { r1: refund({ amount: 100 }) } })
    expect(remainingRefundable(o)).toBe(0)
  })
})

describe("totalsFor — gross / refunds / net stay distinct", () => {
  const orders = [
    mkOrder({ id: "a", total: 100 }),
    mkOrder({ id: "b", total: 200, refunds: { r1: refund({ id: "r1", amount: 50, orderId: "b" }) } }),
    mkOrder({ id: "c", total: 999, status: "cancelled" }),
  ]

  it("excludes cancelled orders from every figure", () => {
    const t = totalsFor(orders, orders)
    expect(t.orders).toBe(2)
    expect(t.gross).toBe(300)
    expect(t.cancelled).toBe(1)
  })

  it("keeps gross as billed and derives net", () => {
    const t = totalsFor(orders, orders)
    expect(t.gross).toBe(300)
    expect(t.refunds).toBe(50)
    expect(t.net).toBe(250)
    expect(t.net).toBeCloseTo(t.gross - t.refunds, 2)
  })

  it("does not double-count a discount as a second deduction", () => {
    // 265 subtotal, 53 discount, 212 payable.
    const o = mkOrder({ subtotal: 265, discountAmount: 53, total: 212 })
    const t = totalsFor([o], [o])
    expect(t.gross).toBe(212)
    expect(t.discountGiven).toBe(53)
    expect(t.net).toBe(212)
  })

  it("reports zero for an empty set without dividing by zero", () => {
    const t = totalsFor([], [])
    expect(t.gross).toBe(0)
    expect(t.net).toBe(0)
    expect(t.avgOrder).toBe(0)
  })

  it("averages over valid orders only", () => {
    const t = totalsFor(orders, orders)
    expect(t.avgOrder).toBe(150)
  })

  it("sums items sold", () => {
    const t = totalsFor(orders, orders)
    expect(t.itemsSold).toBe(2)
  })

  it("reconciles the drawer from tender and change", () => {
    const t = totalsFor(orders, orders)
    expect(t.cashCollected).toBe(300)
    expect(t.changeGiven).toBe(0)
  })

  it("handles a fully refunded order netting to zero", () => {
    const o = mkOrder({ total: 100, refunds: { r1: refund({ amount: 100 }) } })
    const t = totalsFor([o], [o])
    expect(t.gross).toBe(100)
    expect(t.refunds).toBe(100)
    expect(t.net).toBe(0)
  })
})

describe("refundRows", () => {
  it("flattens refunds across orders, newest first", () => {
    const orders = [
      mkOrder({ id: "a", refunds: { r1: refund({ id: "r1", createdAt: "2026-03-08T10:00:00Z" }) } }),
      mkOrder({ id: "b", refunds: { r2: refund({ id: "r2", orderId: "b", createdAt: "2026-03-09T10:00:00Z" }) } }),
    ]
    const rows = refundRows(orders)
    expect(rows.map((r) => r.id)).toEqual(["r2", "r1"])
    expect(rows[0].cashierName).toBe("Juan")
  })

  it("returns nothing when there are no refunds", () => {
    expect(refundRows([mkOrder()])).toEqual([])
  })

  it("skips non-completed refunds", () => {
    const o = mkOrder({ refunds: { r1: refund({ status: "pending" as any }) } })
    expect(refundRows([o])).toEqual([])
  })

  it("preserves the approving admin for audit", () => {
    const o = mkOrder({ refunds: { r1: refund({ approvedBy: "admin-9", approvedByName: "Owner" }) } })
    expect(refundRows([o])[0].approvedBy).toBe("admin-9")
    expect(refundRows([o])[0].approvedByName).toBe("Owner")
  })
})