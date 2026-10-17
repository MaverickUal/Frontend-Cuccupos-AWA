import { describe, it, expect } from "vitest"
import {
  normalizeMenuName,
  findDuplicateGroups,
  findConflictingMenuItems,
  findCrossCategoryNameMatches,
} from "@/lib/duplicates"

const item = (id: string, name: string, category: string) => ({ id, name, category })

describe("normalizeMenuName", () => {
  it("folds case", () => {
    expect(normalizeMenuName("Iced Americano")).toBe("iced americano")
  })

  it("strips leading and trailing whitespace", () => {
    expect(normalizeMenuName("   Matcha   ")).toBe("matcha")
  })

  it("collapses repeated internal whitespace", () => {
    expect(normalizeMenuName("Caramel   Macchiato")).toBe("caramel macchiato")
    expect(normalizeMenuName("Caramel\t\nMacchiato")).toBe("caramel macchiato")
  })

  it("combines all three at once", () => {
    expect(normalizeMenuName("  TARO   Milk\tTea ")).toBe("taro milk tea")
  })

  it("normalizes non-breaking spaces and full-width characters via NFKC", () => {
    expect(normalizeMenuName("Taro Milk Tea")).toBe("taro milk tea")
    expect(normalizeMenuName("ＭＡＴＣＨＡ")).toBe("matcha")
  })

  it("leaves an already-clean name untouched apart from case", () => {
    expect(normalizeMenuName("Matcha")).toBe("matcha")
  })
})

describe("findDuplicateGroups", () => {
  it("finds nothing in a menu of unique names", () => {
    const menu = [item("1", "Matcha", "Coffee"), item("2", "Mocha Frappe", "Frappe")]
    expect(findDuplicateGroups(menu)).toEqual([])
  })

  it("groups exact duplicates in the same category", () => {
    const menu = [item("1", "Matcha", "Coffee"), item("2", "Matcha", "Coffee"), item("3", "Mocha", "Coffee")]
    const groups = findDuplicateGroups(menu)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe("Matcha")
    expect(groups[0].category).toBe("Coffee")
    expect(groups[0].items.map((i) => i.id)).toEqual(["1", "2"])
  })

  it("treats case and whitespace differences as duplicates", () => {
    const menu = [item("1", "Iced  Americano", "Coffee"), item("2", "iced americano", "Coffee")]
    expect(findDuplicateGroups(menu)).toHaveLength(1)
  })

  it("does not group the same name across different categories", () => {
    const menu = [item("1", "Latte", "Coffee"), item("2", "Latte", "Milk Tea")]
    expect(findDuplicateGroups(menu)).toEqual([])
  })

  it("catches a group of three", () => {
    const menu = [item("1", "Matcha", "Coffee"), item("2", " MATCHA ", "Coffee"), item("3", "matcha", "coffee")]
    const groups = findDuplicateGroups(menu)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(3)
  })

  it("reports several separate groups independently", () => {
    const menu = [
      item("1", "Matcha", "Coffee"), item("2", "Matcha", "Coffee"),
      item("3", "Taro", "Milk Tea"), item("4", "Taro", "Milk Tea"),
      item("5", "Unique", "Others"),
    ]
    const groups = findDuplicateGroups(menu)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.label)).toEqual(["Matcha", "Taro"])
  })

  it("returns an empty list for an empty menu", () => {
    expect(findDuplicateGroups([])).toEqual([])
  })

  it("does not flag differing prices as distinct products", () => {
    const menu = [
      { ...item("1", "Matcha", "Coffee"), price: 100 },
      { ...item("2", "Matcha", "Coffee"), price: 120 },
    ]
    expect(findDuplicateGroups(menu)).toHaveLength(1)
  })
})

describe("findConflictingMenuItems", () => {
  const menu = [item("1", "Matcha", "Coffee"), item("2", "Taro", "Milk Tea"), item("3", "Mocha", "Coffee")]

  it("returns the clash for a new duplicate", () => {
    expect(findConflictingMenuItems(menu, "Matcha", "Coffee").map((i) => i.id)).toEqual(["1"])
  })

  it("returns nothing for a genuinely new product", () => {
    expect(findConflictingMenuItems(menu, "Cortado", "Coffee")).toEqual([])
  })

  it("excludes the item being edited so a product never conflicts with itself", () => {
    expect(findConflictingMenuItems(menu, "Matcha", "Coffee", "1")).toEqual([])
  })

  it("catches a rename that collides with a different item in the same category", () => {
    expect(findConflictingMenuItems(menu, "Taro", "Milk Tea", "3").map((i) => i.id)).toEqual(["2"])
  })

  it("allows moving an item to a category where the name is still free", () => {
    expect(findConflictingMenuItems(menu, "Taro", "Coffee", "2")).toEqual([])
  })

  it("matches despite case and extra whitespace", () => {
    expect(findConflictingMenuItems(menu, "  mAtChA  ", "Coffee").map((i) => i.id)).toEqual(["1"])
  })

  it("allows the same name in a different category", () => {
    expect(findConflictingMenuItems(menu, "Matcha", "Others")).toEqual([])
  })

  it("reports every item in a larger duplicate group", () => {
    const many = [item("1", "Matcha", "Coffee"), item("2", "matcha", "Coffee"), item("3", "MATCHA", "Coffee")]
    expect(findConflictingMenuItems(many, "Matcha", "Coffee")).toHaveLength(3)
  })
})

describe("findCrossCategoryNameMatches", () => {
  it("finds the same product name listed under two categories", () => {
    const menu = [item("1", "Latte", "Coffee"), item("2", "Latte", "Milk Tea")]
    const matches = findCrossCategoryNameMatches(menu)
    expect(matches).toHaveLength(1)
    expect(matches[0].items).toHaveLength(2)
  })

  it("ignores same-name items that share a category, since findDuplicateGroups owns those", () => {
    const menu = [item("1", "Latte", "Coffee"), item("2", "Latte", "Coffee")]
    expect(findCrossCategoryNameMatches(menu)).toEqual([])
  })

  it("ignores unique names", () => {
    expect(findCrossCategoryNameMatches([item("1", "Matcha", "Coffee")])).toEqual([])
  })

  it("reports a name split across three categories", () => {
    const menu = [item("1", "Latte", "Coffee"), item("2", "Latte", "Milk Tea"), item("3", "latte", "Frappe")]
    const matches = findCrossCategoryNameMatches(menu)
    expect(matches).toHaveLength(1)
    expect(matches[0].items).toHaveLength(3)
  })
})