import type { Order } from "@/types"

export const startOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
export const endOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}
export const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
export const validOrders = (orders: Order[]) => orders.filter((o) => o.status !== "cancelled")
export const sumTotal = (orders: Order[]) => orders.reduce((s, o) => s + o.total, 0)

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

export type RangePreset = "today" | "7d" | "30d" | "custom"

export interface DateRange {
  preset: RangePreset
  /** Inclusive start. */
  from: Date
  /** Inclusive end. */
  to: Date
  /** Bucket by hour (today) instead of by day. */
  hourly: boolean
  /** Human label for headings, e.g. "Today" or "Oct 1 – Oct 7". */
  label: string
}

export const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
]

/** Parse a `yyyy-mm-dd` input value as a *local* date (not UTC midnight). */
export function parseDayInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export const toDayInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const fmtShort = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })

export function resolveRange(preset: RangePreset, fromRaw?: string, toRaw?: string): DateRange {
  const today = startOfDay(new Date())
  const now = new Date()

  if (preset === "today") {
    return { preset, from: today, to: now, hourly: true, label: "Today" }
  }
  if (preset === "7d") {
    return { preset, from: addDays(today, -6), to: now, hourly: false, label: "Last 7 days" }
  }
  if (preset === "30d") {
    return { preset, from: addDays(today, -29), to: now, hourly: false, label: "Last 30 days" }
  }

  // Custom: fall back to the last 7 days when a bound is missing or invalid.
  let from = parseDayInput(fromRaw ?? "") ?? addDays(today, -6)
  let to = parseDayInput(toRaw ?? "") ?? today
  if (from > to) [from, to] = [to, from] // tolerate a reversed pick

  const singleDay = from.getTime() === to.getTime()
  const isToday = to.getTime() === today.getTime()
  const label = singleDay ? fmtShort(from) : `${fmtShort(from)} – ${fmtShort(to)}`
  return {
    preset,
    from,
    to: singleDay ? endOfDay(to) : endOfDay(to),
    hourly: singleDay && isToday,
    label,
  }
}

export const inRange = (orders: Order[], range: DateRange) =>
  orders.filter((o) => {
    const t = new Date(o.createdAt)
    return t >= range.from && t <= range.to
  })

export interface Point {
  label: string
  revenue: number
  orders: number
  /** Bucket start / end, used for tooltips. */
  from: Date
  to: Date
}

/**
 * Time series for the chosen range: hourly buckets for today, daily otherwise.
 * Empty buckets are kept so quiet periods show as real zeroes instead of the
 * axis silently compressing.
 */
export function seriesFor(orders: Order[], range: DateRange): Point[] {
  const valid = validOrders(inRange(orders, range))
  const out: Point[] = []

  if (range.hourly) {
    const startHour = range.from.getHours()
    const endHour = Math.max(range.to.getHours(), startHour)
    for (let h = startHour; h <= endHour; h++) {
      const from = new Date(range.from)
      from.setHours(h, 0, 0, 0)
      const to = new Date(from)
      to.setHours(h + 1, 0, 0, 0)
      const bucket = valid.filter((o) => {
        const t = new Date(o.createdAt)
        return t >= from && t < to
      })
      out.push({
        label: from
          .toLocaleTimeString("en-PH", { hour: "numeric", hour12: true })
          .toLowerCase()
          .replace(/\s/g, ""),
        revenue: sumTotal(bucket),
        orders: bucket.length,
        from,
        to,
      })
    }
    return out
  }

  let cursor = startOfDay(range.from)
  const last = startOfDay(range.to)
  while (cursor <= last) {
    const from = new Date(cursor)
    const to = addDays(from, 1)
    const bucket = valid.filter((o) => {
      const t = new Date(o.createdAt)
      return t >= from && t < to
    })
    out.push({
      label: fmtShort(from),
      revenue: sumTotal(bucket),
      orders: bucket.length,
      from,
      to,
    })
    cursor = addDays(cursor, 1)
  }
  return out
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export function topItems(orders: Order[], limit = 5) {
  const m = new Map<string, { name: string; qty: number; revenue: number }>()
  validOrders(orders).forEach((o) =>
    Object.values(o.items).forEach((i) => {
      const r = m.get(i.menuItemId) ?? { name: i.name, qty: 0, revenue: 0 }
      r.qty += i.qty
      r.revenue += i.qty * i.price
      m.set(i.menuItemId, r)
    })
  )
  return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, limit)
}

export function byCategory(orders: Order[]) {
  const m = new Map<string, { category: string; qty: number; revenue: number }>()
  validOrders(orders).forEach((o) =>
    Object.values(o.items).forEach((i) => {
      const r = m.get(i.category) ?? { category: i.category, qty: 0, revenue: 0 }
      r.qty += i.qty
      r.revenue += i.qty * i.price
      m.set(i.category, r)
    })
  )
  return [...m.values()].sort((a, b) => b.revenue - a.revenue)
}