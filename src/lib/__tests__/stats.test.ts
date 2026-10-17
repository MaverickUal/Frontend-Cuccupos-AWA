/**
 * Date-range boundaries, ordering, and timezone behaviour.
 *
 * These run in a fixed local timezone via TZ=UTC in vitest.config.ts unless
 * overridden, and a second suite runs under a DST timezone to catch
 * hour-bucketing drift.
 */
import { describe, expect, it } from "vitest"
import {
  addDays,
  endOfDay,
  inRange,
  parseDayInput,
  resolveRange,
  seriesFor,
  sortByCreatedAtDesc,
  startOfDay,
  timeOf,
  toDayInput,
} from "@/lib/stats"
import type { Order, OrderStatus } from "@/types"

const status = "completed" as OrderStatus

const order = (createdAt: string, extra: Partial<Order> = {}): Order =>
  ({
    id: createdAt,
    customerId: "u1",
    customerName: "Test",
    items: {},
    total: 100,
    paymentMethod: "Cash",
    status,
    createdAt,
    ...extra,
  }) as Order

const today = startOfDay(new Date())
const iso = (d: Date) => d.toISOString()
const at = (dayOffset: number, h: number, m = 0) => {
  const d = addDays(today, dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}

describe("parseDayInput", () => {
  it("parses a valid yyyy-mm-dd as local midnight", () => {
    const d = parseDayInput("2026-03-08")!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(8)
    expect(d.getHours()).toBe(0)
  })

  it("rejects impossible dates instead of rolling them over", () => {
    // The original defect: new Date(2026, 1, 31) silently becomes 3 March.
    expect(parseDayInput("2026-02-31")).toBeNull()
    expect(parseDayInput("2026-04-31")).toBeNull()
    expect(parseDayInput("2026-13-01")).toBeNull()
    expect(parseDayInput("2026-00-10")).toBeNull()
    expect(parseDayInput("2026-01-00")).toBeNull()
  })

  it("accepts the last day of a real month, incl. leap day", () => {
    expect(parseDayInput("2026-02-28")).not.toBeNull()
    expect(parseDayInput("2024-02-29")).not.toBeNull()
    expect(parseDayInput("2026-02-29")).toBeNull() // 2026 is not a leap year
  })

  it("rejects malformed and empty input", () => {
    expect(parseDayInput("")).toBeNull()
    expect(parseDayInput("   ")).toBeNull()
    expect(parseDayInput("not-a-date")).toBeNull()
    expect(parseDayInput("2026/03/08")).toBeNull()
    expect(parseDayInput("26-03-08")).toBeNull()
  })

  it("round-trips through toDayInput", () => {
    const d = parseDayInput("2026-03-08")!
    expect(toDayInput(d)).toBe("2026-03-08")
  })
})

describe("resolveRange — start never after end", () => {
  it("orders a reversed custom range instead of producing an inverted range", () => {
    const r = resolveRange("custom", "2026-03-10", "2026-03-01")
    expect(r.from.getTime()).toBeLessThanOrEqual(r.to.getTime())
    expect(toDayInput(r.from)).toBe("2026-03-01")
    expect(toDayInput(startOfDay(r.to))).toBe("2026-03-10")
  })

  it("keeps a valid range untouched", () => {
    const r = resolveRange("custom", "2026-03-01", "2026-03-10")
    expect(toDayInput(r.from)).toBe("2026-03-01")
    expect(toDayInput(startOfDay(r.to))).toBe("2026-03-10")
  })

  it("covers the whole final day for a single-day range (inclusive end)", () => {
    const r = resolveRange("custom", "2026-03-08", "2026-03-08")
    expect(r.to.getHours()).toBe(23)
    expect(r.to.getMinutes()).toBe(59)
    expect(r.to.getSeconds()).toBe(59)
    // A record at 23:59 the same day must be included.
    const late = order("2026-03-08T23:59:00")
    expect(inRange([late], r)).toHaveLength(1)
  })

  it("excludes the day after a single-day range", () => {
    const r = resolveRange("custom", "2026-03-08", "2026-03-08")
    const nextDay = order("2026-03-09T00:30:00")
    expect(inRange([nextDay], r)).toHaveLength(0)
  })

  it("falls back safely on invalid input", () => {
    const r = resolveRange("custom", "garbage", "2026-13-45")
    expect(Number.isFinite(r.from.getTime())).toBe(true)
    expect(Number.isFinite(r.to.getTime())).toBe(true)
    expect(r.from.getTime()).toBeLessThanOrEqual(r.to.getTime())
  })
})

describe("resolveRange — presets and bucketing rules", () => {
  it("Today uses hourly buckets", () => {
    expect(resolveRange("today").hourly).toBe(true)
  })

  it("7d and 30d use daily buckets", () => {
    expect(resolveRange("7d").hourly).toBe(false)
    expect(resolveRange("30d").hourly).toBe(false)
  })

  it("Custom on today still uses hourly buckets", () => {
    const r = resolveRange("custom", toDayInput(today), toDayInput(today))
    expect(r.hourly).toBe(true)
  })

  it("Custom on a past single day uses daily buckets", () => {
    const past = addDays(today, -40)
    expect(resolveRange("custom", toDayInput(past), toDayInput(past)).hourly).toBe(false)
  })

  it("spans the right number of days", () => {
    expect(seriesFor([], resolveRange("7d"))).toHaveLength(7)
    expect(seriesFor([], resolveRange("30d"))).toHaveLength(30)
  })

  it("a 7d window starting today reaches back 6 days", () => {
    expect(toDayInput(resolveRange("7d").from)).toBe(toDayInput(addDays(today, -6)))
  })
})

describe("seriesFor", () => {
  it("orders buckets oldest first", () => {
    const pts = seriesFor([], resolveRange("7d"))
    const times = pts.map((p) => p.from.getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it("puts each order in exactly one bucket (no double counting at midnight)", () => {
    const midnight = at(0, 0, 0)
    const justBefore = new Date(midnight.getTime() - 1000)
    const orders = [order(iso(midnight)), order(iso(justBefore))]
    const series = seriesFor(orders, resolveRange("custom", toDayInput(today), toDayInput(today)))
    expect(series.reduce((s, p) => s + p.orders, 0)).toBe(1)
  })

  it("places a midnight order in the new day's bucket, not the previous one", () => {
    const from = addDays(today, -2)
    const to = addDays(today, -1)
    const edge = at(-1, 0, 0)
    const series = seriesFor([order(iso(edge))], resolveRange("custom", toDayInput(from), toDayInput(to)))
    const hit = series.find((p) => p.orders === 1)
    expect(hit).toBeDefined()
    expect(toDayInput(hit!.from)).toBe(toDayInput(at(-1, 0, 0)))
  })

  it("never double-counts cancelled orders", () => {
    const o = order(iso(at(0, 12)), { status: "cancelled", total: 999 })
    const series = seriesFor([o], resolveRange("today"))
    expect(series.reduce((s, p) => s + p.revenue, 0)).toBe(0)
  })

  it("sums revenue within a bucket", () => {
    const orders = [order(iso(at(0, 9)), { total: 100 }), order(iso(at(0, 9, 30)), { total: 50 })]
    const series = seriesFor(orders, resolveRange("today"))
    const nine = series.find((p) => p.label === "9am") ?? series.find((p) => p.orders === 2)
    expect(nine!.revenue).toBe(150)
    expect(nine!.orders).toBe(2)
  })

  it("keeps empty buckets as zeroes", () => {
    const series = seriesFor([], resolveRange("7d"))
    expect(series.every((p) => p.revenue === 0 && p.orders === 0)).toBe(true)
  })

  it("excludes orders outside the range", () => {
    const old = order(iso(addDays(today, -40)))
    const now = order(iso(at(0, 12)))
    expect(seriesFor([old, now], resolveRange("7d")).reduce((s, p) => s + p.orders, 0)).toBe(1)
  })

  it("drops records with unusable timestamps instead of placing them at epoch 0", () => {
    const broken = { ...order(""), createdAt: "not-a-date" } as Order
    expect(seriesFor([broken], resolveRange("7d")).reduce((s, p) => s + p.orders, 0)).toBe(0)
  })
})

describe("timeOf", () => {
  it("parses ISO strings", () => {
    expect(timeOf({ createdAt: "2026-03-08T10:00:00.000Z" })).toBe(Date.parse("2026-03-08T10:00:00.000Z"))
  })

  it("accepts Date instances", () => {
    const d = new Date("2026-03-08T10:00:00.000Z")
    expect(timeOf({ createdAt: d })).toBe(d.getTime())
  })

  it("returns null for missing or invalid values", () => {
    expect(timeOf({ createdAt: undefined })).toBeNull()
    expect(timeOf({ createdAt: null })).toBeNull()
    expect(timeOf({ createdAt: "" })).toBeNull()
    expect(timeOf({ createdAt: "banana" })).toBeNull()
  })
})

describe("sortByCreatedAtDesc", () => {
  it("returns newest first", () => {
    const list = [order("2026-03-01T09:00:00"), order("2026-03-03T09:00:00"), order("2026-03-02T09:00:00")]
    const sorted = sortByCreatedAtDesc(list)
    expect(sorted.map((o) => o.createdAt)).toEqual([
      "2026-03-03T09:00:00",
      "2026-03-02T09:00:00",
      "2026-03-01T09:00:00",
    ])
  })

  it("orders by real time, not display number", () => {
    // Same order number prefix, different times.
    const list = [
      order("2026-03-01T09:00:00", { displayId: "ORD-ABC" }),
      order("2026-03-05T09:00:00", { displayId: "ORD-AAA" }),
    ]
    expect(sortByCreatedAtDesc(list)[0].displayId).toBe("ORD-AAA")
  })

  it("sinks records with no usable timestamp to the end", () => {
    const list = [
      { ...order("bad"), createdAt: "nope" },
      order("2026-03-02T09:00:00"),
      { ...order("bad2"), createdAt: undefined },
    ]
    const sorted = sortByCreatedAtDesc(list)
    expect(sorted[0].createdAt).toBe("2026-03-02T09:00:00")
    expect(sorted.slice(1).every((o) => o.createdAt !== "2026-03-02T09:00:00")).toBe(true)
  })

  it("does not mutate the input", () => {
    const list = [order("2026-03-01T09:00:00"), order("2026-03-03T09:00:00")]
    const before = list.map((o) => o.createdAt)
    sortByCreatedAtDesc(list)
    expect(list.map((o) => o.createdAt)).toEqual(before)
  })

  it("is stable for identical timestamps", () => {
    const list = [order("2026-03-01T09:00:00", { id: "a" }), order("2026-03-01T09:00:00", { id: "b" })]
    expect(sortByCreatedAtDesc(list).map((o) => o.id)).toEqual(["a", "b"])
  })

  it("handles an empty list", () => {
    expect(sortByCreatedAtDesc([])).toEqual([])
  })
})

describe("day helpers", () => {
  it("startOfDay and endOfDay bracket a local day", () => {
    const d = at(0, 13, 45)
    expect(startOfDay(d).getHours()).toBe(0)
    expect(endOfDay(d).getHours()).toBe(23)
    expect(endOfDay(d).getMilliseconds()).toBe(999)
  })

  it("addDays crosses month boundaries", () => {
    expect(toDayInput(addDays(new Date(2026, 0, 31), 1))).toBe("2026-02-01")
    expect(toDayInput(addDays(new Date(2026, 0, 1), -1))).toBe("2025-12-31")
  })

  it("addDays(0) is a no-op on the calendar day", () => {
    expect(toDayInput(addDays(today, 0))).toBe(toDayInput(today))
  })
})