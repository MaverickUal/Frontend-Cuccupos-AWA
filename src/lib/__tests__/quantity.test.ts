import { describe, it, expect } from "vitest"
import { parseQty } from "@/components/QuantityStepper"
import { MAX_QTY } from "@/store/AppStore"

describe("parseQty", () => {
  it("accepts a normal quantity", () => {
    expect(parseQty("5")).toBe(5)
  })

  it("accepts the maximum", () => {
    expect(parseQty(String(MAX_QTY))).toBe(MAX_QTY)
  })

  it("tolerates leading zeros", () => {
    expect(parseQty("07")).toBe(7)
  })

  it("tolerates surrounding whitespace", () => {
    expect(parseQty("  3  ")).toBe(3)
  })

  it("clamps above the maximum instead of refusing", () => {
    expect(parseQty("150")).toBe(MAX_QTY)
    expect(parseQty("99")).toBe(MAX_QTY)
    expect(parseQty("100")).toBe(MAX_QTY)
  })

  it("clamps zero up to one rather than deleting the line", () => {
    expect(parseQty("0")).toBe(1)
    expect(parseQty("00")).toBe(1)
  })

  it("clamps negatives to one", () => {
    expect(parseQty("-5")).toBe(1)
  })

  it("takes the leading digits of a decimal", () => {
    expect(parseQty("2.9")).toBe(2)
    expect(parseQty("2.50")).toBe(2)
  })

  it("rejects an empty field", () => {
    expect(parseQty("")).toBeNull()
    expect(parseQty("   ")).toBeNull()
  })

  it("rejects text with no digits", () => {
    expect(parseQty("abc")).toBeNull()
    expect(parseQty(".")).toBeNull()
    expect(parseQty("-")).toBeNull()
  })

  it("rejects a lone decimal point", () => {
    expect(parseQty(".")).toBeNull()
  })

  it("never returns a fractional quantity", () => {
    for (const raw of ["3", "3.7", "10", "0.5"]) {
      const n = parseQty(raw)
      if (n !== null) expect(Number.isInteger(n)).toBe(true)
    }
  })

  it("always stays within the 1..MAX_QTY range", () => {
    for (const raw of ["", "0", "-1", "1", "99", "100", "9999", "abc", "3.2"]) {
      const n = parseQty(raw)
      if (n !== null) {
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(MAX_QTY)
      }
    }
  })
})