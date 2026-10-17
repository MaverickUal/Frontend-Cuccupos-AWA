import { describe, it, expect } from "vitest"
import { buildReceipt, receiptFilename, discountLabel } from "@/lib/receipt"
import type { Order } from "@/types"

const base = (over: Partial<Order> = {}): Order =>
  ({
    id: "-Nabc123",
    displayId: "ORD-MVC6Q1Z9",
    customerId: "cashier-1",
    customerName: "Gian",
    items: {
      a: { menuItemId: "m_1", name: "Iced Americano", price: 100, qty: 2, category: "Coffee" },
      b: { menuItemId: "m_6", name: "Matcha", price: 105, qty: 1, category: "Others" },
    },
    subtotal: 305,
    total: 244,
    paymentMethod: "Cash",
    cashTendered: 300,
    changeGiven: 56,
    status: "completed",
    createdAt: "2026-03-05T09:14:00.000Z",
    ...over,
  }) as Order

describe("discountLabel", () => {
  it("names the PWD concession", () => expect(discountLabel("pwd")).toBe("PWD discount"))
  it("names the senior concession", () => expect(discountLabel("senior")).toBe("Senior Citizen discount"))
  it("falls back for absent or unknown values", () => {
    expect(discountLabel(undefined)).toBe("Discount")
    expect(discountLabel("none")).toBe("Discount")
    expect(discountLabel("weird")).toBe("Discount")
  })
})

describe("buildReceipt", () => {
  it("selects only the given order's line items", () => {
    const r = buildReceipt(base())
    expect(r.lines).toHaveLength(2)
    expect(r.lines.map((l) => l.name)).toEqual(["Iced Americano", "Matcha"])
  })

  it("computes each line total from unit price and qty", () => {
    const r = buildReceipt(base())
    expect(r.lines[0].lineTotal).toBe(200)
    expect(r.lines[1].lineTotal).toBe(105)
  })

  it("carries the order number, timestamp and cashier", () => {
    const r = buildReceipt(base())
    expect(r.orderNumber).toBe("ORD-MVC6Q1Z9")
    expect(r.createdAt).toBe("2026-03-05T09:14:00.000Z")
    expect(r.cashierName).toBe("Gian")
  })

  it("exposes subtotal, discount and total for a discounted order", () => {
    const r = buildReceipt(base({ discountType: "pwd", discountAmount: 61 }))
    expect(r.subtotal).toBe(305)
    expect(r.discountAmount).toBe(61)
    expect(r.discountLabel).toBe("PWD discount")
    expect(r.total).toBe(244)
  })

  it("includes cash tendered and change", () => {
    const r = buildReceipt(base())
    expect(r.cashTendered).toBe(300)
    expect(r.changeGiven).toBe(56)
  })

  it("reports zero discount and falls back to total when subtotal is missing", () => {
    const r = buildReceipt(base({ subtotal: undefined, discountType: undefined, discountAmount: undefined }))
    expect(r.subtotal).toBe(244)
    expect(r.discountAmount).toBe(0)
  })

  it("survives an order with no refund history", () => {
    const r = buildReceipt(base())
    expect(r.refunds).toEqual([])
    expect(r.refundedTotal).toBe(0)
    expect(r.remainingRefundable).toBe(244)
  })

  it("includes refund history oldest-first with the remaining balance", () => {
    const r = buildReceipt(
      base({
        refunds: {
          r2: {
            id: "r2", orderId: "-Nabc123", amount: 44, reason: "Wrong drink",
            status: "completed", createdAt: "2026-03-06T10:00:00.000Z",
            approvedBy: "admin-1", approvedByName: "Owner",
          },
          r1: {
            id: "r1", orderId: "-Nabc123", amount: 100, reason: "Spilled",
            status: "completed", createdAt: "2026-03-05T11:00:00.000Z",
            approvedBy: "admin-1",
          },
        },
      })
    )
    expect(r.refunds.map((x) => x.id)).toEqual(["r1", "r2"])
    expect(r.refundedTotal).toBe(144)
    expect(r.remainingRefundable).toBe(100)
  })

  it("ignores refund records that are not completed", () => {
    const r = buildReceipt(
      base({
        refunds: {
          r1: {
            id: "r1", orderId: "-Nabc123", amount: 244, reason: "Pending",
            status: "pending" as any, createdAt: "2026-03-05T11:00:00.000Z", approvedBy: "admin-1",
          },
        },
      })
    )
    expect(r.refunds).toEqual([])
    expect(r.refundedTotal).toBe(0)
  })

  it("falls back to the push id for orders with no display id", () => {
    expect(buildReceipt(base({ displayId: undefined })).orderNumber).toBe("-Nabc123")
  })

  it("handles a missing cashier name", () => {
    expect(buildReceipt(base({ customerName: "" })).cashierName).toBe("Unknown")
  })

  it("handles an order with no items", () => {
    expect(buildReceipt(base({ items: {} })).lines).toEqual([])
  })

  it("does not mutate the source order", () => {
    const o = base()
    const snapshot = JSON.stringify(o)
    buildReceipt(o)
    expect(JSON.stringify(o)).toBe(snapshot)
  })

  it("keeps two different orders independent", () => {
    const first = buildReceipt(base({ displayId: "ORD-AAA" }))
    const second = buildReceipt(base({ displayId: "ORD-BBB" }))
    expect(first.orderNumber).toBe("ORD-AAA")
    expect(second.orderNumber).toBe("ORD-BBB")
    expect(first.orderNumber).not.toBe(second.orderNumber)
  })
})

describe("receiptFilename", () => {
  it("uses the friendly order number", () => {
    expect(receiptFilename(base())).toBe("receipt-ORD-MVC6Q1Z9.pdf")
  })

  it("keeps the order number recognizable", () => {
    expect(receiptFilename(base())).toContain("ORD-MVC6Q1Z9")
  })

  it("strips characters that are unsafe in a filename", () => {
    expect(receiptFilename(base({ displayId: "ORD/../../etc/passwd" }))).not.toMatch(/[/\\]/)
    expect(receiptFilename(base({ displayId: "a b:c*d" }))).toBe("receipt-a-b-c-d.pdf")
  })

  it("falls back to the push id when there is no display id", () => {
    expect(receiptFilename(base({ displayId: undefined }))).toBe("receipt-Nabc123.pdf")
  })

  it("never produces an empty name", () => {
    const f = receiptFilename(base({ displayId: "///" }))
    expect(f.endsWith(".pdf")).toBe(true)
    expect(f.length).toBeGreaterThan("receipt-.pdf".length)
  })

  it("respects the requested extension", () => {
    expect(receiptFilename(base(), "txt")).toBe("receipt-ORD-MVC6Q1Z9.txt")
  })
})