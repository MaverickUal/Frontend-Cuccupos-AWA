/**
 * Order validation — the guard that stops a tampered client persisting financial
 * values the calculator would never produce.
 */
import { describe, expect, it } from "vitest"
import { orderSchema } from "@/lib/actions"

const items = {
  m_1: { menuItemId: "m_1", name: "Iced Americano", price: 80, qty: 2, category: "Coffee" },
  m_6: { menuItemId: "m_6", name: "Matcha", price: 105, qty: 1, category: "Others" },
}
// 2*80 + 105 = 265
const base = {
  customerId: "u_cashier",
  customerName: "Juan",
  items,
  subtotal: 265,
  discountType: "none" as const,
  discountAmount: 0,
  total: 265,
  paymentMethod: "Cash" as const,
  cashTendered: 300,
  changeGiven: 35,
  status: "pending" as const,
  createdAt: "2026-03-08T10:00:00.000Z",
}

describe("orderSchema — a legitimate order passes", () => {
  it("accepts a plain full-price cash order", () => {
    expect(orderSchema.safeParse(base).success).toBe(true)
  })

  it("accepts a discounted order that reconciles", () => {
    // 265 subtotal, 20% = 53, total 212, cash 250 -> change 38
    const r = orderSchema.safeParse({
      ...base,
      discountType: "pwd",
      discountAmount: 53,
      total: 212,
      cashTendered: 250,
      changeGiven: 38,
    })
    expect(r.success).toBe(true)
  })

  it("treats the discount fields as optional for pre-discount orders", () => {
    const { subtotal, discountType, discountAmount, ...legacy } = base
    expect(orderSchema.safeParse(legacy).success).toBe(true)
  })
})

describe("orderSchema — rejects tampered money", () => {
  it("rejects a total that does not match the items", () => {
    const r = orderSchema.safeParse({ ...base, total: 1 })
    expect(r.success).toBe(false)
  })

  it("rejects a subtotal that does not match the items", () => {
    expect(orderSchema.safeParse({ ...base, subtotal: 999 }).success).toBe(false)
  })

  it("rejects an inflated discount", () => {
    const r = orderSchema.safeParse({
      ...base,
      discountType: "pwd",
      discountAmount: 200,
      total: 65,
      cashTendered: 100,
      changeGiven: 35,
    })
    expect(r.success).toBe(false)
  })

  it("rejects a discount applied to a full-price order", () => {
    expect(
      orderSchema.safeParse({ ...base, discountType: "senior", discountAmount: 53, total: 265 }).success
    ).toBe(false)
  })

  it("rejects cash that does not cover the total", () => {
    expect(orderSchema.safeParse({ ...base, cashTendered: 100, changeGiven: -165 }).success).toBe(false)
  })

  it("rejects an incorrect change figure", () => {
    expect(orderSchema.safeParse({ ...base, cashTendered: 300, changeGiven: 99 }).success).toBe(false)
  })

  it("rejects a non-cash payment method", () => {
    expect(orderSchema.safeParse({ ...base, paymentMethod: "GCash" }).success).toBe(false)
  })

  it("rejects a non-pending initial status", () => {
    // The database rules enforce pending-at-creation; this asserts the schema
    // pins it too, so a caller cannot even build the request.
    expect(orderSchema.safeParse({ ...base, status: "completed" }).success).toBe(false)
  })

  it("rejects an out-of-range quantity", () => {
    const bad = { ...base, items: { m_1: { ...items.m_1, qty: 0 } }, subtotal: 0, total: 0.005 }
    expect(orderSchema.safeParse(bad).success).toBe(false)
  })

  it("rejects a negative price", () => {
    const bad = {
      ...base,
      items: { m_1: { ...items.m_1, price: -10 } },
      subtotal: -20,
      discountAmount: 0,
      total: -20,
      cashTendered: 0,
      changeGiven: 20,
    }
    expect(orderSchema.safeParse(bad).success).toBe(false)
  })

  it("rejects an unknown discount type", () => {
    expect(orderSchema.safeParse({ ...base, discountType: "vip" }).success).toBe(false)
  })

  it("reports the offending field path", () => {
    const r = orderSchema.safeParse({ ...base, total: 1 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("total"))).toBe(true)
    }
  })
})