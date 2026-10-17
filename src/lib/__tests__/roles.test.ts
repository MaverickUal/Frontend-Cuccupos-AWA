import { describe, it, expect } from "vitest"
import { roleLabel, isAdmin, isCashier } from "@/lib/roles"

describe("roleLabel", () => {
  it("names the admin role as Owner/Manager", () => {
    expect(roleLabel("admin")).toBe("Owner/Manager")
  })

  it("names the cashier role as Cashier", () => {
    expect(roleLabel("cashier")).toBe("Cashier")
  })

  it("shows Unknown rather than defaulting an unrecognised role to Cashier", () => {
    // The QA spec is explicit: the UI must not silently present a broken record as a
    // cashier, because an admin mislabelled as a cashier would look like lesser access.
    expect(roleLabel("owner")).toBe("Unknown")
    expect(roleLabel("ADMIN")).toBe("Unknown")
    expect(roleLabel("admin ")).toBe("Unknown")
    expect(roleLabel("")).toBe("Unknown")
  })

  it("handles a missing role", () => {
    expect(roleLabel(undefined)).toBe("Unknown")
    expect(roleLabel(null)).toBe("Unknown")
  })

  it("does not accept the old customer role as anything valid", () => {
    expect(roleLabel("customer")).toBe("Unknown")
  })
})

describe("isAdmin", () => {
  it("is true only for admin", () => {
    expect(isAdmin("admin")).toBe(true)
    expect(isAdmin("cashier")).toBe(false)
    expect(isAdmin(undefined)).toBe(false)
    expect(isAdmin("Admin")).toBe(false)
  })
})

describe("isCashier", () => {
  it("is true only for cashier", () => {
    expect(isCashier("cashier")).toBe(true)
    expect(isCashier("admin")).toBe(false)
    expect(isCashier(null)).toBe(false)
  })
})