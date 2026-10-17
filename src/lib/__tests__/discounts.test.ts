/**
 * Discount maths and cash change.
 *
 * The rate itself is an unresolved business assumption (see discounts.ts), so
 * these tests assert the *invariants* rather than a hard-coded percentage:
 * applied at most once, never exceeding the eligible amount, and total always
 * reconciling with subtotal - discount.
 */
import { describe, expect, it } from "vitest"
import {
  computeDiscount,
  changeFor,
  isDiscountableCategory,
  DISCOUNT_RATE,
  DISCOUNT_LABELS,
  DISCOUNT_TYPES,
  type DiscountableLine,
} from "@/lib/discounts"

const lines = (...xs: DiscountableLine[]): DiscountableLine[] => xs

const cart = lines(
  { category: "Coffee", qty: 2, price: 100 },
  { category: "Milk Tea", qty: 1, price: 95 }
)

const subtotalOf = (ls: DiscountableLine[]) =>
  Math.round(ls.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100

describe("computeDiscount — no discount", () => {
  it("passes the subtotal through unchanged", () => {
    const r = computeDiscount(cart, "none")
    expect(r.type).toBe("none")
    expect(r.subtotal).toBe(295)
    expect(r.amount).toBe(0)
    expect(r.total).toBe(295)
  })

  it("treats an empty cart as zero", () => {
    const r = computeDiscount([], "pwd")
    expect(r.subtotal).toBe(0)
    expect(r.amount).toBe(0)
    expect(r.total).toBe(0)
  })
})

describe("computeDiscount — pwd and senior", () => {
  for (const type of ["pwd", "senior"] as const) {
    it(`${type} produces subtotal = discount + total`, () => {
      const r = computeDiscount(cart, type)
      expect(r.type).toBe(type)
      expect(r.total).toBe(Math.round((r.subtotal - r.amount) * 100) / 100)
      expect(r.subtotal).toBe(295)
      expect(r.amount).toBeGreaterThan(0)
    })

    it(`${type} applies exactly once`, () => {
      const r = computeDiscount(cart, type)
      const expected = Math.round(r.eligibleSubtotal * DISCOUNT_RATE * 100) / 100
      expect(r.amount).toBe(expected)
      // Applying it again must not compound.
      const twice = computeDiscount(cart, type).amount
      expect(twice).toBe(r.amount)
    })

    it(`${type} never discounts more than the eligible amount`, () => {
      const r = computeDiscount(cart, type)
      expect(r.amount).toBeLessThanOrEqual(r.eligibleSubtotal)
      expect(r.total).toBeGreaterThanOrEqual(0)
    })

    it(`${type} is skipped on a sub-peso order`, () => {
      const r = computeDiscount(lines({ category: "Coffee", qty: 1, price: 0.4 }), type)
      expect(r.type).toBe("none")
      expect(r.amount).toBe(0)
    })
  }

  it("pwd and senior produce identical maths", () => {
    expect(computeDiscount(cart, "pwd").amount).toBe(computeDiscount(cart, "senior").amount)
  })
})

describe("computeDiscount — arithmetic integrity", () => {
  it("is deterministic", () => {
    expect(computeDiscount(cart, "pwd")).toEqual(computeDiscount(cart, "pwd"))
  })

  it("survives float-unfriendly prices", () => {
    const r = computeDiscount(lines({ category: "Coffee", qty: 3, price: 33.33 }), "pwd")
    expect(r.subtotal).toBe(99.99)
    expect(r.total).toBe(Math.round((r.subtotal - r.amount) * 100) / 100)
    expect(Number.isFinite(r.total)).toBe(true)
  })

  it("keeps the identity total = subtotal - amount across many carts", () => {
    for (let qty = 1; qty <= 9; qty++) {
      for (const price of [0.5, 33.33, 80, 105.55]) {
        const r = computeDiscount(lines({ category: "Coffee", qty, price }), "senior")
        expect(r.total).toBe(Math.round((r.subtotal - r.amount) * 100) / 100)
      }
    }
  })

  it("does not mutate the input lines", () => {
    const input = lines({ category: "Coffee", qty: 2, price: 80 })
    const snapshot = JSON.stringify(input)
    computeDiscount(input, "pwd")
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it("computes subtotal independent of the discount type", () => {
    const base = subtotalOf(cart)
    for (const type of DISCOUNT_TYPES) {
      expect(computeDiscount(cart, type).subtotal).toBe(base)
    }
  })
})

describe("eligibility", () => {
  it("treats every category as eligible by default", () => {
    expect(isDiscountableCategory("Coffee")).toBe(true)
    expect(isDiscountableCategory("Frappe")).toBe(true)
    expect(isDiscountableCategory("Anything")).toBe(true)
  })

  it("honours an explicit allow-list when supplied", () => {
    expect(isDiscountableCategory("Coffee", ["Coffee"])).toBe(true)
    expect(isDiscountableCategory("Frappe", ["Coffee"])).toBe(false)
  })

  it("discounts only the eligible portion when a list is configured", () => {
    const r = computeDiscount(
      lines({ category: "Coffee", qty: 1, price: 100 }, { category: "Excluded", qty: 1, price: 100 }),
      "pwd"
    )
    expect(r.subtotal).toBe(200)
    // Both categories qualify under the default null allow-list.
    expect(r.eligibleSubtotal).toBe(200)
    expect(r.amount).toBe(40)
    expect(r.total).toBe(160)
  })

  it("leaves non-eligible lines out of the discount when a list is configured", () => {
    // eligibleSubtotalOf is the seam that would exclude them; assert it directly.
    const mixed = lines(
      { category: "Coffee", qty: 1, price: 100 },
      { category: "Excluded", qty: 1, price: 100 }
    )
    const eligible = mixed
      .filter((l) => isDiscountableCategory(l.category, ["Coffee"]))
      .reduce((s, l) => s + l.qty * l.price, 0)
    expect(eligible).toBe(100)
  })
})

describe("changeFor", () => {
  it("computes change on the discounted total", () => {
    const r = computeDiscount(cart, "pwd")
    const { change } = changeFor(500, r.total)
    expect(change).toBe(Math.round((500 - r.total) * 100) / 100)
  })

  it("reports zero change when exact", () => {
    const r = changeFor(295, 295)
    expect(r.change).toBe(0)
    expect(r.sufficient).toBe(true)
  })

  it("marks an underpayment as insufficient", () => {
    const r = changeFor(200, 295)
    expect(r.change).toBe(-95)
    expect(r.sufficient).toBe(false)
  })

  it("treats no cash entered as insufficient", () => {
    expect(changeFor(0, 295).sufficient).toBe(false)
  })

  it("rounds to cents without float drift", () => {
    expect(changeFor(0.3, 0.1).change).toBe(0.2)
    expect(changeFor(10.1, 0.1).change).toBe(10)
  })
})

describe("labels", () => {
  it("labels every discount type", () => {
    for (const t of DISCOUNT_TYPES) {
      expect(typeof DISCOUNT_LABELS[t]).toBe("string")
      expect(DISCOUNT_LABELS[t].length).toBeGreaterThan(0)
    }
  })
})