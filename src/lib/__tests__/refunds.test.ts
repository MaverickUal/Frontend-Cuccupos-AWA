import { describe, expect, it } from "vitest"
import { applyRefund, remainingRefundable, refundedOf } from "@/lib/refunds"
import type { Order } from "@/types"

const baseOrder = (): Order => ({
  id: "o1",
  customerId: "u1",
  customerName: "Cashier",
  items: {},
  total: 100,
  paymentMethod: "Cash",
  status: "completed",
  createdAt: "2026-10-18T12:00:00.000Z",
})

describe("refunds", () => {
  it("calculates remaining refundable from stored order", () => {
    const o = baseOrder()
    expect(remainingRefundable(o)).toBe(100)
  })

  it("rejects cancelled orders", () => {
    const o = { ...baseOrder(), status: "cancelled" as any }
    expect(() => applyRefund(o, { amount: 10, reason: "test reason" }, { uid: "admin" })).toThrow()
  })

  it("rejects refund exceeding remaining balance", () => {
    const o = baseOrder()
    expect(() => applyRefund(o, { amount: 150, reason: "test reason" }, { uid: "admin" })).toThrow()
  })

  it("requires reason", () => {
    const o = baseOrder()
    expect(() => applyRefund(o, { amount: 10, reason: "ab" }, { uid: "admin" })).toThrow()
  })

  it("requires positive amount", () => {
    const o = baseOrder()
    expect(() => applyRefund(o, { amount: 0, reason: "test reason" }, { uid: "admin" })).toThrow()
    expect(() => applyRefund(o, { amount: -5, reason: "test reason" }, { uid: "admin" })).toThrow()
  })

  it("appends refund and updates refundedTotal", () => {
    const o = baseOrder()
    const updated = applyRefund(o, { amount: 30, reason: "wrong drink" }, { uid: "admin", name: "Owner" })
    expect(refundedOf(updated)).toBe(30)
    expect(remainingRefundable(updated)).toBe(70)
    const refunds = Object.values(updated.refunds ?? {})
    expect(refunds).toHaveLength(1)
    expect(refunds[0].approvedBy).toBe("admin")
    expect(refunds[0].reason).toBe("wrong drink")
  })

  it("handles equal dates and partial refunds", () => {
    const o = baseOrder()
    const first = applyRefund(o, { amount: 40, reason: "partial" }, { uid: "admin" })
    const second = applyRefund(first, { amount: 60, reason: "rest" }, { uid: "admin" })
    expect(refundedOf(second)).toBe(100)
    expect(remainingRefundable(second)).toBe(0)
  })

  it("rejects refund when fully refunded", () => {
    const o = { ...baseOrder(), refundedTotal: 100 }
    expect(() => applyRefund(o, { amount: 1, reason: "test reason" }, { uid: "admin" })).toThrow()
  })
})